import { redirect } from "next/navigation";

export default async function WorkbenchMapRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const q = new URLSearchParams(params as Record<string, string>).toString();
    redirect(`/map${q ? `?${q}` : ""}`);
}
