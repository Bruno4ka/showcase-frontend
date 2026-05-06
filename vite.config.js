import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: '.', // Корень проекта
  publicDir: 'public', // Папка для статических файлов (опционально)
  build: {
    outDir: 'dist', // Куда собирать проект
  },
  server: {
    port: 5173, // Порт для dev-сервера
    open: true, // Автоматически открыть браузер
  }
})