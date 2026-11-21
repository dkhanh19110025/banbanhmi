import { defineConfig } from 'vite';

export default defineConfig({
  // Đường dẫn tương đối: chạy được cả trên Netlify, GitHub Pages (thư mục con) lẫn itch.io (iframe)
  base: './',
  build: {
    // Trình duyệt điện thoại đời mới đều hỗ trợ, bỏ được code chuyển đổi thừa
    target: 'es2020',
    // Three.js đã ~500kB, nâng ngưỡng cảnh báo cho đỡ ồn
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Tách Three.js riêng: sửa game xong deploy lại, người chơi cũ không phải tải lại Three.js
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
