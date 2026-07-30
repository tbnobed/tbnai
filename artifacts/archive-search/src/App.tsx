import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import SearchPage from '@/pages/search';
import LibraryPage from '@/pages/library';
import HistoryPage from '@/pages/history';
import AdminPage from '@/pages/admin';
import SignInPage from '@/pages/sign-in';
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
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(28, 68%, 48%)",
    colorForeground: "hsl(25, 18%, 18%)",
    colorMutedForeground: "hsl(25, 12%, 45%)",
    colorDanger: "hsl(0, 65%, 51%)",
    colorBackground: "hsl(30, 35%, 98%)",
    colorInput: "hsl(32, 15%, 88%)",
    colorInputForeground: "hsl(25, 18%, 18%)",
    colorNeutral: "hsl(32, 15%, 88%)",
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    borderRadius: "0.375rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(30,35%,98%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-[hsl(32,15%,90%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-[hsl(25,18%,18%)] font-semibold text-2xl",
    headerSubtitle: "text-[hsl(25,12%,45%)]",
    socialButtonsBlockButtonText: "text-[hsl(25,18%,18%)] font-medium",
    formFieldLabel: "text-[hsl(25,18%,18%)] font-medium",
    footerActionLink: "text-[hsl(28,68%,48%)] font-medium hover:text-[hsl(28,68%,42%)]",
    footerActionText: "text-[hsl(25,12%,45%)]",
    dividerText: "text-[hsl(25,12%,45%)]",
    identityPreviewEditButton: "text-[hsl(28,68%,48%)]",
    formFieldSuccessText: "text-green-700",
    alertText: "text-[hsl(25,18%,18%)]",
    logoBox: "h-12 mb-4",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border-[hsl(32,15%,88%)] hover:bg-[hsl(32,18%,92%)]",
    formButtonPrimary: "bg-[hsl(28,68%,48%)] hover:bg-[hsl(28,68%,42%)] text-white font-medium",
    formFieldInput: "border-[hsl(32,15%,88%)] bg-white text-[hsl(25,18%,18%)] focus:border-[hsl(28,68%,48%)]",
    footerAction: "gap-1",
    dividerLine: "bg-[hsl(32,15%,88%)]",
    alert: "border-[hsl(32,15%,88%)]",
    otpCodeFieldInput: "border-[hsl(32,15%,88%)]",
    formFieldRow: "gap-4",
    main: "gap-6",
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
        <Landing />
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
      <Route path="/history">
        <ProtectedRoute component={HistoryPage} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminPage} />
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
            title: "Welcome back",
            subtitle: "Sign in to access the archive",
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
