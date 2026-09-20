import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode, type MouseEvent } from 'react';
import { prefetchRoute } from './routePrefetch';

export interface Route {
  path: string;
  search: URLSearchParams;
}

const parseLocation = (): Route => ({
  path: window.location.pathname.replace(/\/+$/, '') || '/',
  search: new URLSearchParams(window.location.search)
});

const RouterContext = createContext<{ route: Route; navigate: (to: string) => void } | null>(null);

export const RouterProvider = ({ children }: { children: ReactNode }) => {
  const [route, setRoute] = useState<Route>(parseLocation);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (to: string) => {
    if (to === window.location.pathname + window.location.search) return;
    window.history.pushState(null, '', to);
    setRoute(parseLocation());
    window.scrollTo({ top: 0 });
  };

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>;
};

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter called outside RouterProvider');
  return context;
};

export const Link = ({
  to,
  className,
  style,
  children,
  onClick
}: {
  to: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
}) => {
  const { navigate } = useRouter();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick?.();
    navigate(to);
  };
  // Prefetch on intent: a hover/focus/touch that reaches this link is a
  // strong signal the click is coming, so start loading that route's lazy
  // chunk immediately — by the time the click lands, React's lazy() import
  // is often already resolved, so the route mounts instantly instead of
  // waiting out a cold chunk fetch. A no-op for routes with no lazy chunk
  // (Home) or on Data Saver / 2G (see routePrefetch.ts).
  const prefetch = () => prefetchRoute(to);
  return (
    <a
      href={to}
      className={className}
      style={style}
      onClick={handleClick}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      {children}
    </a>
  );
};

/** Matches "/races/:sessionId" style patterns; returns params or null. */
export const matchPath = (pattern: string, path: string): Record<string, string> | null => {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i];
    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternPart !== pathParts[i]) {
      return null;
    }
  }
  return params;
};
