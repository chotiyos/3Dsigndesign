import { lazy, Suspense } from 'react'
import Home from './pages/Home'
import { Account, Login } from './pages/Account'
import { Contact, HowTo, Legal, Plugin } from './pages/Info'
import { Files } from './pages/Shop'
import { NotFoundBody, StyleDetail, StylesIndex } from './pages/Styles'
import { useLocation, useNavigationScroll } from './router'
import { SiteShell } from './ui/SiteShell'

const Editor = lazy(() => import('./pages/Editor'))
const Gen = lazy(() => import('./pages/Gen'))
const Lightbox = lazy(() => import('./pages/Lightbox'))
const Keychain = lazy(() => import('./pages/Keychain'))
const Clicker = lazy(() => import('./pages/Clicker'))
const TwoTone = lazy(() => import('./pages/TwoTone'))

function Loading() {
  return (
    <div className="loading" role="status">
      กำลังเปิด…
    </div>
  )
}

export default function App() {
  const { path, search, hash } = useLocation()
  useNavigationScroll()

  if (path === '/app') {
    return (
      <Suspense fallback={<Loading />}>
        <Editor key={search + hash} />
      </Suspense>
    )
  }

  let page
  if (path === '/') page = <Home />
  else if (path === '/styles') page = <StylesIndex />
  else if (path.startsWith('/styles/')) page = <StyleDetail id={path.slice('/styles/'.length)} />
  else if (path === '/files') page = <Files />
  else if (path === '/gen') page = <Gen />
  else if (path === '/lightbox') page = <Lightbox />
  else if (path === '/keychain') page = <Keychain />
  else if (path === '/clicker') page = <Clicker />
  else if (path === '/twotone') page = <TwoTone />
  else if (path === '/how-to') page = <HowTo />
  else if (path === '/plugin') page = <Plugin />
  else if (path === '/contact') page = <Contact />
  else if (path === '/terms') page = <Legal kind="terms" />
  else if (path === '/privacy') page = <Legal kind="privacy" />
  else if (path === '/login') page = <Login />
  else if (path === '/account') page = <Account />
  else page = <NotFoundBody />

  return (
    <SiteShell>
      <Suspense fallback={<Loading />}>{page}</Suspense>
    </SiteShell>
  )
}
