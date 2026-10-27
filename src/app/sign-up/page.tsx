import { AuthPage } from "@/components/auth/auth-page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return <AuthPage mode="sign-up" error={first(params.error)} message={first(params.message)} />;
}
