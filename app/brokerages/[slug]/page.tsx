import type { Metadata } from "next";
import { PublicProfessionalSite, getProfessionalSite } from "@/app/components/public-professional-site";
import { publicPageMetadata } from "@/lib/seo/metadata";
export const dynamic = "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const site=await getProfessionalSite(slug,"brokerage");return site?publicPageMetadata({title:`${site.display_name} — Jamaica property brokerage`,description:site.headline??`Browse active Jamaica listings from ${site.display_name}.`,path:`/brokerages/${slug}`}):{title:"Brokerage website unavailable",robots:{index:false,follow:false}};}
export default async function BrokerageSitePage({params}:{params:Promise<{slug:string}>}){return <PublicProfessionalSite slug={(await params).slug} expectedType="brokerage"/>;}
