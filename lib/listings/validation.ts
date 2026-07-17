import { z } from "zod";

const optionalDecimal = (maximum: number) => z.union([
  z.literal("").transform(() => null),
  z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number).pipe(z.number().positive().max(maximum)),
]);

const optionalWholeNumber = z.union([
  z.literal("").transform(() => null),
  z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(100)),
]);

export const createListingDraftSchema = z.object({
  administrativeAreaId: z.string().uuid(),
  addressLine1: z.string().trim().min(2).max(200),
  addressLine2: z.string().trim().max(200),
  postalCode: z.string().trim().max(20),
  purpose: z.enum(["sale", "long_term_rent"]),
  propertyType: z.enum(["residential", "commercial", "land", "development"]),
  propertySubtype: z.string().trim().max(80),
  price: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number).pipe(z.number().positive().max(999_999_999_999.99)),
  pricePeriod: z.enum(["", "month", "year"]),
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(20).max(10_000),
  bedrooms: optionalWholeNumber,
  bathrooms: optionalDecimal(100),
  buildingArea: optionalDecimal(999_999_999_999.99),
  landArea: optionalDecimal(999_999_999_999.99),
  areaUnit: z.enum(["", "sq_ft", "sq_m", "acre", "hectare"]),
  visibility: z.enum(["private", "professional_network", "public"]),
  publicLocationPrecision: z.enum(["exact", "street", "area", "hidden"]),
}).superRefine((value, context) => {
  if (value.purpose === "sale" && value.pricePeriod !== "") {
    context.addIssue({ code: "custom", path: ["pricePeriod"], message: "A sale price does not use a billing period." });
  }
  if (value.purpose === "long_term_rent" && value.pricePeriod === "") {
    context.addIssue({ code: "custom", path: ["pricePeriod"], message: "Choose monthly or yearly rent." });
  }
  if ((value.buildingArea !== null || value.landArea !== null) && value.areaUnit === "") {
    context.addIssue({ code: "custom", path: ["areaUnit"], message: "Choose an area unit." });
  }
});

