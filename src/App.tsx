import { lazy, Suspense } from 'react'
import Home from './pages/Home'
import { Account, Login } from './pages/Account'
import { Contact, HowTo, Legal, Plugin, Pricing } from './pages/Info'
import { Cart, Files, Materials } from './pages/Shop'
import { NotFoundBody, StyleDetail, StylesIndex } from './pages/Styles'
import { useLocation, useNavigationScroll } from './router'
import { SiteShell } from './ui/SiteShell'

const Editor = lazy(() => import('./pages/Editor'))
const Gen = lazy(() => import('./pages/Gen'))

function Loading() {
  return (
    <div className="loading" role="status">
      กำลังเปิด…
    </div>
  )
}

export default function App() {
  const { path, search } = useLocation()
  useNavigationScroll()

  if (path === '/app') {
    return (
      <Suspense fallback={<Loading />}>
        <Editor key={search} />
      </Suspense>
    )
  }

  let page
  if (path === '/') page = <Home />
  else if (path === '/styles') page = <StylesIndex />
  else if (path.startsWith('/styles/')) page = <StyleDetail id={path.slice('/styles/'.length)} />
  else if (path === '/files') page = <Files />
  else if (path === '/materials') page = <Materials />
  else if (path === '/materials/cart') page = <Cart />
  else if (path === '/gen') page = <Gen />
  else if (path === '/pricing') page = <Pricing />
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
