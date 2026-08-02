import type { Metadata } from "next";
import {
  buildTenantMetadata,
  renderTenantRoute,
  type TenantRouteParams,
} from "@/ui/site/tenant-route";

export async function generateMetadata({
  params,
}: TenantRouteParams): Promise<Metadata> {
  const { host } = await params;
  return buildTenantMetadata(host, "en");
}

export default async function TenantHomeEnglish({
  params,
}: TenantRouteParams) {
  const { host } = await params;
  return renderTenantRoute(host, "en");
}
