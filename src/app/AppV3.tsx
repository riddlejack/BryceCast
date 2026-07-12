import type { ComponentType, ReactNode } from 'react';
import { CalendarClock, Flag, Home, LineChart, Radio } from 'lucide-react';
import './theme.css';
import { Link, RouterProvider, matchPath, useRouter } from './router';
import { CarMark, Plate } from './components';
import { useReadiness } from './useReadiness';
import { HomeScreen } from '../screens/HomeScreen';
import { LiveScreen } from '../screens/LiveScreen';
import { RaceWeekScreen } from '../screens/RaceWeekScreen';
import { RacesScreen } from '../screens/RacesScreen';
import { RaceDetailScreen } from '../screens/RaceDetailScreen';
import { CareerScreen } from '../screens/CareerScreen';
import { CareerRaceScreen } from '../screens/CareerRaceScreen';
import { DataScreen } from '../screens/DataScreen';

const navItems: Array<{ to: string; label: string; icon: ComponentType<{ size?: number | string }> }> = [
  { to: '/', label: 'Now', icon: Home },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/race-week', label: 'Race Week', icon: CalendarClock },
  { to: '/races', label: 'Races', icon: Flag },
  { to: '/career', label: 'Career', icon: LineChart }
];

const isActive = (path: string, to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

const Shell = ({ children, liveState }: { children: ReactNode; liveState: string | undefined }) => {
  const { route } = useRouter();
  const liveish = liveState === 'ready' || liveState === 'degraded';
  return (
    <>
      <nav className="topnav">
        <Link to="/" className="brand">
          <Plate size="nav" />
          BryceCast
        </Link>
        <div className="row" style={{ gap: 24, flex: 1 }}>
          {navItems.slice(1).map((item) => (
            <Link key={item.to} to={item.to} className={`navlink${isActive(route.path, item.to) ? ' navlink--active' : ''}`}>
              {item.label}
              {item.to === '/live' && liveish ? <span className="live-dot" style={{ color: 'var(--status-good)' }} aria-hidden /> : null}
            </Link>
          ))}
        </div>
        <Link to="/data" className={`navlink${isActive(route.path, '/data') ? ' navlink--active' : ''}`} >
          Data
        </Link>
      </nav>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
      <footer className="footer">
        <div className="footer__inner">
          <span className="row" style={{ gap: 10 }}>
            <CarMark height={16} />
            BryceCast · following Bryce Aron, No. 9, Chip Ganassi Racing · built by family, powered by official sources
          </span>
          <span className="row" style={{ gap: 14 }}>
            <Link to="/data">Data &amp; sources</Link>
          </span>
        </div>
      </footer>
      <nav className="tabbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(route.path, item.to);
          return (
            <Link key={item.to} to={item.to} className={`tab${active ? ' tab--active' : ''}`}>
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon size={19} />
                {item.to === '/live' && liveish ? (
                  <span
                    className="live-dot"
                    style={{ position: 'absolute', top: -2, right: -5, color: 'var(--status-good)' }}
                    aria-hidden
                  />
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
};

const Routes = () => {
  const { route } = useRouter();
  const readiness = useReadiness();
  const raceDetail = matchPath('/races/:sessionId', route.path);
  const careerRace = matchPath('/career/race/:sessionId', route.path);

  let screen: ReactNode;
  if (route.path === '/') screen = <HomeScreen readiness={readiness} />;
  else if (route.path === '/live') screen = <LiveScreen payload={readiness.payload} fixtureMode={readiness.fixtureMode} />;
  else if (route.path === '/race-week') screen = <RaceWeekScreen />;
  else if (raceDetail) screen = <RaceDetailScreen sessionId={raceDetail.sessionId} />;
  else if (route.path === '/races') screen = <RacesScreen />;
  else if (careerRace) screen = <CareerRaceScreen sessionId={careerRace.sessionId} />;
  else if (route.path === '/career') screen = <CareerScreen />;
  else if (route.path === '/data') screen = <DataScreen />;
  else
    screen = (
      <div className="page">
        <h1 className="display">Not found</h1>
        <Link to="/" className="navlink">
          Back to BryceCast
        </Link>
      </div>
    );

  return <Shell liveState={readiness.payload?.state}>{screen}</Shell>;
};

export const AppV3 = () => (
  <RouterProvider>
    <Routes />
  </RouterProvider>
);
