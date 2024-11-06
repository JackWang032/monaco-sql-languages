import{e as h,R as b,d as v,M as C,W as y,l as w}from"./index-36800767.js";var m=globalThis&&globalThis.__awaiter||function(o,t,n,r){function a(i){return i instanceof n?i:new n(function(e){e(i)})}return new(n||(n=Promise))(function(i,e){function s(u){try{p(r.next(u))}catch(d){e(d)}}function l(u){try{p(r.throw(u))}catch(d){e(d)}}function p(u){u.done?i(u.value):a(u.value).then(s,l)}p((r=r.apply(o,t||[])).next())})};class M{constructor(t,n,r){this._languageId=t,this._worker=n,this._defaults=r,this._disposables=[],this._listener=Object.create(null);const a=e=>{let s=e.getLanguageId();s===this._languageId&&(this._listener[e.uri.toString()]=e.onDidChangeContent(v(()=>{this._doValidate(e.uri,s)},500)),this._doValidate(e.uri,s))},i=e=>{h.setModelMarkers(e,this._languageId,[]);let s=e.uri.toString(),l=this._listener[s];l&&(l.dispose(),delete this._listener[s])};this._disposables.push(h.onDidCreateModel(a)),this._disposables.push(h.onWillDisposeModel(i)),this._disposables.push(h.onDidChangeModelLanguage(e=>{i(e.model),a(e.model)})),this._disposables.push(this._defaults.onDidChange(e=>{h.getModels().forEach(s=>{s.getLanguageId()===this._languageId&&(i(s),a(s))})})),this._disposables.push({dispose:()=>{for(let e in this._listener)this._listener[e].dispose()}}),h.getModels().forEach(a)}dispose(){this._disposables.forEach(t=>t&&t.dispose()),this._disposables=[]}_doValidate(t,n){this._worker(t).then(r=>{var a;let i=((a=h.getModel(t))===null||a===void 0?void 0:a.getValue())||"";return typeof this._defaults.preprocessCode=="function"&&(i=this._defaults.preprocessCode(i)),r.doValidation(i)}).then(r=>{const a=r.map(e=>k(t,e));let i=h.getModel(t);i&&i.getLanguageId()===n&&h.setModelMarkers(i,n,a)}).then(void 0,r=>{console.error(r)})}}function I(o){switch(o){default:return C.Error}}function k(o,t){return{severity:I(),startLineNumber:t.startLine,startColumn:t.startColumn,endLineNumber:t.endLine,endColumn:t.endColumn,message:t.message,code:void 0,source:"dt-sql-parser"}}class A{constructor(t,n){this._worker=t,this._defaults=n}get triggerCharacters(){return Array.isArray(this._defaults.triggerCharacters)?this._defaults.triggerCharacters:["."," "]}provideCompletionItems(t,n,r,a){const i=t.uri;return this._worker(i).then(e=>{var s;let l=((s=h.getModel(i))===null||s===void 0?void 0:s.getValue())||"";return typeof this._defaults.preprocessCode=="function"&&(l=this._defaults.preprocessCode(l)),e.doCompletionWithEntities(l,n)}).then(e=>m(this,[e],void 0,function*({suggestions:s,allEntities:l,context:p}){let u=[];return p!=null&&p.isNewStatement&&(u=this._defaults.completionSnippets.map(d=>Object.assign(Object.assign({},d),{insertText:typeof d.body=="string"?d.body:d.body.join(`
`)}))),this._defaults.completionService(t,n,r,s,l,u)})).then(e=>{const s=t.getWordUntilPosition(n),l=new b(n.lineNumber,s.startColumn,n.lineNumber,s.endColumn);return{suggestions:(Array.isArray(e)?e:e.suggestions).map(d=>{var c,g;return Object.assign(Object.assign({},d),{insertText:(c=d.insertText)!==null&&c!==void 0?c:typeof d.label=="string"?d.label:d.label.label,range:(g=d.range)!==null&&g!==void 0?g:l})}),dispose:Array.isArray(e)?void 0:e.dispose,incomplete:Array.isArray(e)?void 0:e.incomplete}})}}function S(o){const t=[],n=[],r=new y(o);t.push(r);const a=(...e)=>r.getLanguageServiceWorker(...e);function i(){const{languageId:e,modeConfiguration:s}=o;_(n),s.diagnostics&&n.push(new M(e,a,o)),s.completionItems.enable&&n.push(w.registerCompletionItemProvider(e,new A(a,o)))}return i(),t.push(f(n)),f(t)}function f(o){return{dispose:()=>_(o)}}function _(o){for(var t;o.length;)(t=o.pop())===null||t===void 0||t.dispose()}export{S as setupLanguageMode};
