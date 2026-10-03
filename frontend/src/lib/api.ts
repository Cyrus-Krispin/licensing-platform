export type User={username:string;role:'OPERATOR'|'OFFICER'}; export type Workspace={heading:string;message:string;username:string};
let csrf='';
export async function getCsrf(){const r=await fetch('/api/auth/csrf'); if(!r.ok)throw new Error('Service unavailable'); csrf=(await r.json()).token; return csrf;}
export async function me():Promise<User|null>{const r=await fetch('/api/auth/me'); return r.status===401||r.status===403?null:r.ok?r.json():Promise.reject(new Error('Unable to restore your session'));}
export async function login(username:string,password:string){if(!csrf)await getCsrf(); const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-XSRF-TOKEN':csrf},body:new URLSearchParams({username,password})}); if(!r.ok)throw new Error(r.status===401?'Incorrect username or password':'Sign in failed'); return me();}
export async function workspace(role:User['role']):Promise<Workspace>{const r=await fetch(`/api/workspaces/${role.toLowerCase()}`);if(!r.ok)throw new Error('Workspace could not be loaded');return r.json();}
export async function logout(){if(!csrf)await getCsrf();const r=await fetch('/api/auth/logout',{method:'POST',headers:{'X-XSRF-TOKEN':csrf}});if(!r.ok)throw new Error('Sign out failed');csrf='';}
