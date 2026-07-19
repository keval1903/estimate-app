import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Products from './pages/Products'
import EstimateList from './pages/EstimateList'
import CreateEstimate from './pages/CreateEstimate'
import EstimateView from './pages/EstimateView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                   element={<Home />} />
        <Route path="/products"           element={<Products />} />
        <Route path="/estimates"          element={<EstimateList />} />
        <Route path="/estimate/new"       element={<CreateEstimate />} />
        <Route path="/estimate/edit/:id"  element={<CreateEstimate />} />
        <Route path="/estimate/view/:id"  element={<EstimateView />} />
      </Routes>
    </BrowserRouter>
  )
}
