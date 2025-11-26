import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MakerStarknetProvider, TakerStarknetProvider } from './lib/starknet'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MakerStarknetProvider>
      <TakerStarknetProvider>
        <App />
      </TakerStarknetProvider>
    </MakerStarknetProvider>
  </StrictMode>,
)
