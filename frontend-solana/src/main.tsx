// Polyfills must be imported first
import './polyfills';

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MakerStarknetProvider, TakerStarknetProvider } from './lib/starknet'
import { MakerSolanaProvider, TakerSolanaProvider } from './lib/chains/solana'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MakerStarknetProvider>
      <TakerStarknetProvider>
        <MakerSolanaProvider>
          <TakerSolanaProvider>
            <App />
          </TakerSolanaProvider>
        </MakerSolanaProvider>
      </TakerStarknetProvider>
    </MakerStarknetProvider>
  </StrictMode>,
)
