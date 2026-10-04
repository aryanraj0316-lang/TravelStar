// Website-only navigation frame. Imported only from `*.web.tsx` route
// layouts, so it never enters the Android bundle.
//
// From 768px up this replaces the phone's floating bottom dock with a
// sidebar (icons only below 1264px, icons and labels above). Below 768px
// every element here is `display: none` / `display: contents` (see
// web-shell.css), so narrow browsers get exactly the phone layout.
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
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useApp } from '@/store/AppContext';

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

function BrandMark() {
  return (
    <svg className="ts-brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="ts-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E3A8A" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="40" height="40" rx="12" fill="url(#ts-mark-grad)" />
      <path
        d="M20 8.5l2.6 8.9 8.9 2.6-8.9 2.6L20 31.5l-2.6-8.9L8.5 20l8.9-2.6z"
        fill="#FFFFFF"
      />
      <circle cx="29.5" cy="10.5" r="1.6" fill="#FCD34D" />
    </svg>
  );
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
  const { t } = useTranslation();
  const router = useRouter();
  const {
    isLoggedIn,
    profile,
    hasUnreadChat,
    hasUnreadNotification,
    setActiveRoomId,
    setNavbarHidden,
  } = useApp();

  const activeTab: TabName | null =
    pathname === '/' ? 'index' : ((Object.keys(TAB_PATHS) as TabName[]).find((k) => k !== 'index' && pathname === TAB_PATHS[k]) ?? null);

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
    <nav className="ts-rail" aria-label="Primary">
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
        <BrandMark />
        <span className="ts-brand-word">Yatrenzo</span>
      </a>

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
        <div className="ts-rail-copy">© {new Date().getFullYear()} Yatrenzo</div>
      </footer>
    </nav>
  );
}

export function WebShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless = isChromeless(pathname);

  // Wide screens keep the page hidden until the app has hydrated, so the
  // static HTML (always rendered at phone width) never flashes before the
  // desktop layout replaces it. See `.ts-hydrated` in web-shell.css.
  useEffect(() => {
    document.documentElement.classList.add('ts-hydrated');
  }, []);

  return (
    <div className={`ts-shell${chromeless ? ' is-chromeless' : ''}`}>
      {chromeless ? null : <WebSidebar pathname={pathname} />}
      <main className="ts-main">
        <div className={`ts-stage ${chromeless ? 'is-full' : stageClass(pathname)}`}>{children}</div>
      </main>
    </div>
  );
}
