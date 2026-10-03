import type {ButtonHTMLAttributes} from 'react'; export function Button(p:ButtonHTMLAttributes<HTMLButtonElement>){return <button {...p} className={`button ${p.className??''}`}/>;}
