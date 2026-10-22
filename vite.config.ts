import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// 페이지 두 개: 캐릭터 뷰어(index.html), 연습 모드(practice.html)
const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  build: {
    rollupOptions: {
      input: { viewer: page('index.html'), practice: page('practice.html') },
    },
  },
});
