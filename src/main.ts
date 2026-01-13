import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// 样式导入顺序：设计令牌 -> 基础样式
import './assets/design-tokens.css'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
