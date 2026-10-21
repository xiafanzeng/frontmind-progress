import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach,vi} from 'vitest';
afterEach(()=>cleanup());
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn().mockImplementation((query:string)=>({matches:false,media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}))});
// jsdom omits Element scrolling and resize-observer APIs the workspaces use.
if(typeof window.HTMLElement.prototype.scrollTo!=='function'){
  window.HTMLElement.prototype.scrollTo=function(){};
}
if(typeof window.ResizeObserver==='undefined'){
  window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
}
