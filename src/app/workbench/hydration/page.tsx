import { redirect } from "next/navigation";

export default async function WorkbenchHydrationRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/decisions${q ? `?${q}` : ""}`);
}
