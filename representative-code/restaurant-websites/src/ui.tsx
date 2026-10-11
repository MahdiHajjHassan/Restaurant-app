import React, {useState} from 'react';
import {Sun, Moon, Download, ArrowRight, Search, Plus, Check, X, Clock, ChevronRight, ChevronDown, Settings, Database, FileText, Users, Calendar, Activity, Play, RefreshCw, AlertCircle, Code2, Layers, ShieldCheck, Building2, Utensils, Menu, CheckCircle2, Wifi, WifiOff, Send, ExternalLink, Package, GitBranch, Inbox, Eye, Trash2, Circle, PanelLeft, MoreHorizontal} from 'lucide-react';

export const icons = {Sun,Moon,Download,ArrowRight,Search,Plus,Check,X,Clock,ChevronRight,ChevronDown,Settings,Database,FileText,Users,Calendar,Activity,Play,RefreshCw,AlertCircle,Code2,Layers,ShieldCheck,Building2,Utensils,Menu,CheckCircle2,Wifi,WifiOff,Send,ExternalLink,Package,GitBranch,Inbox,Eye,Trash2,Circle,PanelLeft,MoreHorizontal};
export function Icon({name, size=18, ...props}: {name:string;size?:number;[key:string]:any}) {const C=icons[name] || Circle; return <C size={size} strokeWidth={1.7} aria-hidden="true" {...props}/>;}
async function request(path:string, payload?:any) {
  const response=await fetch('/api/'+path, payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Could not complete the action.');
  return result;
}
export const api={state:()=>request('state'),action:(name:string,payload:any={})=>request(name,payload)};
export function ThemeToggle() {
  const [theme,setTheme]=useState(document.documentElement.dataset.theme || 'dark');
  return <button className="theme-toggle icon-button" aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'} title={theme==='dark'?'Light mode':'Dark mode'} onClick={()=>{const next=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('product-theme',next);setTheme(next)}}><Icon name={theme==='dark'?'Sun':'Moon'}/></button>
}
export function download(result:any, fallback='dataset.json') {
  const value=result.content ?? result.csv ?? result.html ?? result;
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:result.mime || result.content_type || 'application/json'});
  const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=result.filename || fallback;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
export function SourceLink(){return <a className="source-link" href="/api/source.zip" download><Icon name="Download" size={15}/>Source code</a>}
export function ErrorNotice({error}: {error:any}) {return error?<div className="error-notice" role="alert"><Icon name="AlertCircle"/><span>{String(error)}</span></div>:null;}
