import type { Metadata } from "next";
import { PublicProfessionalSite, getProfessionalSite } from "@/app/components/public-professional-site";
import { publicPageMetadata } from "@/lib/seo/metadata";
export const dynamic = "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params;const site=await getProfessionalSite(slug,"agent");return site?publicPageMetadata({title:`${site.display_name} — Jamaica real estate agent`,description:site.headline??`Browse ${site.display_name}'s active Jamaica property listings.`,path:`/agents/${slug}`}):{title:"Agent website unavailable",robots:{index:false,follow:false}};}
export default async function AgentSitePage({params}:{params:Promise<{slug:string}>}){return <PublicProfessionalSite slug={(await params).slug} expectedType="agent"/>;}
