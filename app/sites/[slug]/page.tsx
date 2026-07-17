import type { Metadata } from "next";
import { PublicProfessionalSite, getProfessionalSite } from "@/app/components/public-professional-site";
export const dynamic = "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const site=await getProfessionalSite(slug);if(!site)return{title:"Professional website unavailable",robots:{index:false,follow:false}};const canonical=site.site_type==="agent"?`/agents/${slug}`:`/brokerages/${slug}`;return{title:site.display_name,description:site.headline??`Browse active Jamaica property listings from ${site.display_name}.`,alternates:{canonical},robots:{index:true,follow:true}};}
export default async function SubdomainSitePage({params}:{params:Promise<{slug:string}>}){return <PublicProfessionalSite slug={(await params).slug}/>;}
