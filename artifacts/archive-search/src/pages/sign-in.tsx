import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4">
      <img
        src={`${basePath}/logo.png`}
        alt="TBNai"
        className="w-[440px] max-w-full h-auto"
      />
      <SignIn routing="path" path={`${basePath}/sign-in`} />
    </div>
  );
}
