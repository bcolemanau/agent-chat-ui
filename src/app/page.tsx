import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { Login } from "@/components/Login";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // If authenticated, redirect to workbench
  if (session) {
    redirect("/workbench/map");
  }

  // If not authenticated, show login page
  return <Login />;
}
