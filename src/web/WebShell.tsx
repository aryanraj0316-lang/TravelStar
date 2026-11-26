// Website-only navigation frame. Imported only from `*.web.tsx` route
// layouts, so it never enters the Android bundle.
//
// Desktop browsers use a sidebar; narrow browsers use a website header.
//
// Each nav action mirrors what the same tap does on the phone:
// - tab items copy AppTabBar's onPress: Profile sends guests to sign-up, Chat
//   clears the open room, and the navbar-hidden flag is reset;
// - Notifications copies the home-screen bell (a plain push).
// Nothing here fetches data. The dots read unread state that AppContext
// already keeps up to date.
import { usePathname, useRouter, type Href } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Home from 'lucide-react-native/icons/house';
import Map from 'lucide-react-native/icons/map';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import User from 'lucide-react-native/icons/user';
import React, { useEffect, useRef, useState } from 'react';
import Menu from 'lucide-react-native/icons/menu';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from 'react-i18next';

import { useApp } from '@/store/AppContext';
import { useHydrated } from '@/web/layout';

// Full-screen flows keep their own chrome: no sidebar around them.
const CHROMELESS_PREFIXES = ['/auth', '/onboarding', '/stories', '/forgot-password', '/reset-password'];

type TabName = 'index' | 'search' | 'create' | 'map' | 'chat' | 'profile';

const TAB_PATHS: Record<TabName, string> = {
  index: '/',
  search: '/search',
  create: '/create',
  map: '/map',
  chat: '/chat',
  profile: '/profile',
};

// The same pages the profile screen links to, as a website footer.
const FOOTER_LINKS = [
  { href: '/about', labelKey: 'about.title' },
  { href: '/support', labelKey: 'support.title' },
  { href: '/legal/terms', labelKey: 'legal.termsTitle' },
  { href: '/legal/privacy', labelKey: 'legal.privacyTitle' },
];

// Page width per route on the website. Screens with their own desktop layout
// use the full width; everything else sits in a centred column so phone-shaped
// content isn't stretched across a wide window.
const FULL_WIDTH_PATHS = new Set(['/', '/search', '/map']);
const READING_PATHS = new Set([
  '/about',
  '/support',
  '/legal/terms',
  '/legal/privacy',
  '/licenses',
  '/notifications',
  '/receipts',
]);

function stageClass(pathname: string) {
  if (FULL_WIDTH_PATHS.has(pathname)) return 'is-full';
  if (pathname === '/chat') return 'is-wide';
  if (READING_PATHS.has(pathname)) return 'is-reading';
  return 'is-column';
}

function isChromeless(pathname: string) {
  return CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type NavItemProps = {
  href: string;
  label: string;
  active: boolean;
  onActivate: () => void;
  icon: React.ReactNode;
  dot?: boolean;
  variant?: 'default' | 'primary';
};

function NavItem({ href, label, active, onActivate, icon, dot, variant = 'default' }: NavItemProps) {
  return (
    <a
      href={href}
      className={`ts-nav-item${active ? ' is-active' : ''}${variant === 'primary' ? ' is-primary' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      title={label}
      onClick={(e) => {
        // Let modified clicks (new tab / window) behave like a normal link.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onActivate();
      }}
    >
      <span className="ts-nav-icon">
        {icon}
        {dot ? <span className="ts-nav-dot" aria-hidden="true" /> : null}
      </span>
      <span className="ts-nav-label">{label}</span>
    </a>
  );
}

function WebSidebar({ pathname }: { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!railRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);
  const { t } = useTranslation();
  const router = useRouter();
  const { isLoggedIn, profile, hasUnreadChat, hasUnreadNotification, setActiveRoomId, setNavbarHidden } = useApp();

  const activeTab: TabName | null =
    pathname === '/'
      ? 'index'
      : ((Object.keys(TAB_PATHS) as TabName[]).find((k) => k !== 'index' && pathname === TAB_PATHS[k]) ?? null);

  // Same steps, in the same order, as AppTabBar's onPress.
  const goTab = (name: TabName) => {
    if (name === 'profile' && !isLoggedIn) {
      router.push('/auth?mode=SIGNUP');
      return;
    }
    if (name === 'chat') {
      setActiveRoomId(null);
    }
    if (activeTab !== name) {
      router.navigate(TAB_PATHS[name] as Href);
    }
    setNavbarHidden(false);
  };

  const iconProps = (on: boolean) => ({ size: 22, color: on ? '#0B1220' : '#334155', strokeWidth: on ? 2.4 : 1.8 });
  const avatarUri = isLoggedIn && profile.avatar ? profile.avatar : null;
  const profileLabel = isLoggedIn ? t('nav.profile') : t('home.loginSignUp');

  return (
    <nav ref={railRef} className={`ts-rail${menuOpen ? ' is-menu-open' : ''}`} aria-label="Primary">
      <button
        ref={menuButtonRef}
        className="ts-menu-toggle"
        type="button"
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={menuOpen}
        aria-controls="ts-navigation-menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <a
        href="/"
        className="ts-brand"
        aria-label="Yatrenzo"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          goTab('index');
        }}
      >
        <span className="ts-brand-initial" aria-hidden="true">
          Y
        </span>
        <span className="ts-brand-word">Yatrenzo</span>
      </a>

      <div className="ts-mobile-create">
        <NavItem
          href="/create"
          label={t('nav.create')}
          active={activeTab === 'create'}
          onActivate={() => goTab('create')}
          icon={<Plus size={20} color="#FFFFFF" />}
          variant="primary"
        />
      </div>
      <div
        id="ts-navigation-menu"
        className="ts-navigation-menu"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setMenuOpen(false);
        }}
      >
        <div className="ts-nav-list">
          <NavItem
            href="/"
            label={t('nav.home')}
            active={activeTab === 'index'}
            onActivate={() => goTab('index')}
            icon={<Home {...iconProps(activeTab === 'index')} />}
          />
          <NavItem
            href="/search"
            label={t('nav.search')}
            active={activeTab === 'search'}
            onActivate={() => goTab('search')}
            icon={<Search {...iconProps(activeTab === 'search')} />}
          />
          <NavItem
            href="/map"
            label={t('nav.map')}
            active={activeTab === 'map'}
            onActivate={() => goTab('map')}
            icon={<Map {...iconProps(activeTab === 'map')} />}
          />
          <NavItem
            href="/chat"
            label={t('nav.chat')}
            active={activeTab === 'chat'}
            onActivate={() => goTab('chat')}
            icon={<MessageSquare {...iconProps(activeTab === 'chat')} />}
            dot={hasUnreadChat}
          />
          <NavItem
            href="/notifications"
            label={t('home.notificationsLabel')}
            active={pathname === '/notifications'}
            onActivate={() => router.push('/notifications')}
            icon={<Bell {...iconProps(pathname === '/notifications')} />}
            dot={hasUnreadNotification}
          />
          <NavItem
            href={isLoggedIn ? '/profile' : '/auth?mode=SIGNUP'}
            label={profileLabel}
            active={activeTab === 'profile'}
            onActivate={() => goTab('profile')}
            icon={
              avatarUri ? (
                <img className={`ts-nav-avatar${activeTab === 'profile' ? ' is-active' : ''}`} src={avatarUri} alt="" />
              ) : (
                <User {...iconProps(activeTab === 'profile')} />
              )
            }
          />
        </div>

        <div className="ts-rail-cta">
          <NavItem
            href="/create"
            label={t('nav.create')}
            active={activeTab === 'create'}
            onActivate={() => goTab('create')}
            icon={<Plus size={20} color="#FFFFFF" strokeWidth={2.4} />}
            variant="primary"
          />
        </div>
      </div>
      <footer className="ts-rail-footer">
        <div className="ts-rail-links">
          {FOOTER_LINKS.map(({ href, labelKey }) => (
            <a
              key={href}
              href={href}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                router.push(href as Href);
              }}
            >
              {t(labelKey)}
            </a>
          ))}
        </div>
        <div className="ts-rail-copy">
          © {new Date().getFullYear()} Yatrenzo
          <br />
          <span>All rights reserved.</span>
        </div>
      </footer>
    </nav>
  );
}

export function WebShell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const { t: tFooter } = useTranslation();
  const { isLoggedIn, sessionRestored } = useApp();
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const chromeless = isChromeless(pathname);
  const publicPage =
    pathname === '/' ||
    [
      '/about',
      '/support',
      '/legal/terms',
      '/legal/privacy',
      '/auth',
      '/forgot-password',
      '/reset-password',
      '/onboarding',
    ].includes(pathname);
  const guestRoute = sessionRestored && !isLoggedIn && !publicPage;
  useEffect(() => {
    setSignInOpen(guestRoute);
  }, [guestRoute, pathname]);
  useEffect(() => {
    if (signInOpen && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!signInOpen && dialogRef.current?.open) dialogRef.current?.close();
  }, [signInOpen]);
  const guardGuestAction = (event: React.SyntheticEvent) => {
    if (isLoggedIn || (publicPage && pathname !== '/')) return;
    const target = event.target as HTMLElement;
    if (target.closest('.ts-menu-toggle, .ts-brand, .ts-signin-dialog, [data-guest-allow]')) return;
    const action = target.closest('a, button, [role=button], input, textarea, select, [role=checkbox], [role=tab]');
    if (!action || (event.type === 'focus' && !action.matches('input, textarea, select'))) return;
    const href = action.getAttribute('href')?.split('?')[0];
    if (href && ['/', '/auth', '/about', '/support', '/legal/terms', '/legal/privacy'].includes(href)) return;
    event.preventDefault();
    event.stopPropagation();
    if (sessionRestored) setSignInOpen(true);
  };

  // Wide screens keep the page hidden until the app has hydrated, so the
  // static HTML (always rendered at phone width) never flashes before the
  // desktop layout replaces it. See `.ts-hydrated` in web-shell.css.
  useEffect(() => {
    document.documentElement.classList.add('ts-hydrated');
  }, []);

  return (
    <div
      className={`ts-shell${chromeless ? ' is-chromeless' : ''}`}
      data-session-ready={sessionRestored}
      onClickCapture={guardGuestAction}
      onFocusCapture={guardGuestAction}
    >
      {chromeless ? null : <WebSidebar pathname={pathname} />}
      <main className="ts-main" inert={!hydrated || !sessionRestored}>
        <div
          className={`ts-stage ${chromeless ? 'is-full' : stageClass(pathname)}${guestRoute ? ' is-guest-route' : ''}`}
          inert={guestRoute}
        >
          {children}
        </div>
        {guestRoute && (
          <div className="ts-guest-route">
            <h1>Sign in to continue</h1>
            <p>Sign in or create an account to use Yatrenzo.</p>
            <button data-guest-allow onClick={() => setSignInOpen(true)}>
              Sign in / Sign up
            </button>
          </div>
        )}
      </main>
      {chromeless ? null : (
        <footer className="ts-site-mobile-footer">
          {FOOTER_LINKS.map(({ href, labelKey }) => (
            <a key={href} href={href}>
              {tFooter(labelKey)}
            </a>
          ))}
          <span>&copy; {new Date().getFullYear()} Yatrenzo</span>
        </footer>
      )}
      <dialog
        ref={dialogRef}
        className="ts-signin-dialog"
        aria-labelledby="ts-signin-title"
        onCancel={() => setSignInOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSignInOpen(false);
        }}
      >
        <button className="ts-signin-close" aria-label="Close sign-in message" onClick={() => setSignInOpen(false)}>
          <X size={20} />
        </button>
        <h2 id="ts-signin-title">Sign in to continue</h2>
        <p>Sign in or create an account to explore trips, make bookings, and connect with travelers.</p>
        <button
          className="ts-signin-primary"
          onClick={() => {
            setSignInOpen(false);
            router.push('/auth?mode=LOGIN');
          }}
        >
          Sign in / Sign up
        </button>
        <button className="ts-signin-later" onClick={() => setSignInOpen(false)}>
          Maybe later
        </button>
      </dialog>
    </div>
  );
}
