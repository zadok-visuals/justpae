import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Next.js 16: searchParams is a Promise — synchronous access was removed.
  const params = await props.searchParams;
  const reset = Array.isArray(params.reset) ? params.reset[0] : params.reset;

  return <LoginForm notice={reset === "success" ? "reset" : undefined} />;
}
