/**
 * 着色器模块入口
 * 统一导出所有着色器源代码
 * 
 * @module engine/shaders
 */

export {
  // 公共函数
  GLSL_COLOR_FUNCTIONS,
  
  // 基础着色器
  BASIC_VERTEX_SHADER,
  BASIC_FRAGMENT_SHADER,
  
  // 转场着色器
  TRANSITION_FRAGMENT_SHADER,
  
  // 叠加层着色器
  OVERLAY_VERTEX_SHADER,
  OVERLAY_FRAGMENT_SHADER,
  
  // 动画着色器
  ANIMATED_VERTEX_SHADER,
  ANIMATED_FRAGMENT_SHADER,
  
  // 着色器集合
  CoreShaders,
} from './CoreShaders'
