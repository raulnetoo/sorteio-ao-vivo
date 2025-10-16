import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/sorteio-ao-vivo/', // 🔴 obrigatório em Pages de projeto
  plugins: [react()],
})
