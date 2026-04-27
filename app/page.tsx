import { redirect } from "next/navigation";

export default function Home() {
  // Teachers: sign in to create assessments
  // Students: access via shared links (/read/[token])
  redirect("/dashboard");
}
