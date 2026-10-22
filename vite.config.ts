import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 페이지: 부캉이 뷰어(index.html), 연습 모드(practice.html), 푸바오 뷰어(fubao.html)
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  build: {
    rollupOptions: {
      input: { viewer: page('index.html'), practice: page('practice.html'), fubao: page('fubao.html') },
    },
  },
});
