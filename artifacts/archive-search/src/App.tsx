import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import SearchPage from '@/pages/search';
import LibraryPage from '@/pages/library';
import HistoryPage from '@/pages/history';
import AdminPage from '@/pages/admin';
import LogsPage from '@/pages/logs';
import SignInPage from '@/pages/sign-in';
import UploadPage from '@/pages/upload';
import { Route, Switch, Redirect, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "none" as const,
  },
  variables: {
    colorPrimary: "hsl(206, 59%, 41%)",
    colorForeground: "hsl(213, 73%, 18%)",
    colorMutedForeground: "hsl(208, 17%, 43%)",
    colorDanger: "hsl(9, 61%, 47%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(206, 30%, 89%)",
    colorInputForeground: "hsl(213, 73%, 18%)",
    colorNeutral: "hsl(206, 30%, 89%)",
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(0,0%,100%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-[hsl(206,30%,89%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    header: "hidden",
    socialButtonsBlockButtonText: "text-[hsl(213,73%,18%)] font-medium",
    formFieldLabel: "text-[hsl(213,73%,18%)] font-medium",
    footerActionLink: "text-[hsl(206,59%,41%)] font-medium hover:text-[hsl(213,73%,18%)]",
    footerActionText: "text-[hsl(208,17%,43%)]",
    dividerText: "text-[hsl(208,17%,43%)]",
    identityPreviewEditButton: "text-[hsl(206,59%,41%)]",
    formFieldSuccessText: "text-green-700",
    alertText: "text-[hsl(213,73%,18%)]",

    socialButtonsBlockButton: "border-[hsl(206,30%,89%)] hover:bg-[hsl(204,33%,97%)]",
    formButtonPrimary: "bg-[hsl(206,59%,41%)] hover:bg-[hsl(213,73%,18%)] text-white font-medium",
    formFieldInput: "border-[hsl(206,30%,89%)] bg-white text-[hsl(213,73%,18%)] focus:border-[hsl(206,59%,41%)]",
    footerAction: "gap-1",
    dividerLine: "bg-[hsl(206,30%,89%)]",
    alert: "border-[hsl(206,30%,89%)]",
    otpCodeFieldInput: "border-[hsl(206,30%,89%)]",
    formFieldRow: "gap-4",
    main: "gap-4",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/search" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?"><Redirect to="/sign-in" /></Route>
      <Route path="/search">
        <ProtectedRoute component={SearchPage} />
      </Route>
      <Route path="/library">
        <ProtectedRoute component={LibraryPage} />
      </Route>
      <Route path="/upload">
        <ProtectedRoute component={UploadPage} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={HistoryPage} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminPage} />
      </Route>
      <Route path="/logs">
        <ProtectedRoute component={LogsPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      localization={{
        signIn: {
          start: {
            title: "Welcome to TBNai",
            titleCombined: "Welcome to TBNai",
            subtitle: "Sign in to search the archive",
            subtitleCombined: "Sign in to search the archive",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
