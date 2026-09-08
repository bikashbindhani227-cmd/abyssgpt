import crypto from 'crypto';
import { persistentStorage } from './storage.js';
import { adminDb } from '../config/firebaseAdmin.js';
import { generateConversationSummary } from './aiCredits.js';
import type { Conversation, ChatMessage, UserMemory } from '../../types.js';

const hasServiceAccount = Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL);
const userRef = (uid:string) => adminDb.collection('users').doc(uid);
const convRef = (uid:string,id:string) => userRef(uid).collection('conversations').doc(id);

export async function createConversation(uid:string,initialTitle='New Conversation'){
  const now=new Date().toISOString(); const id='c_'+crypto.randomUUID();
  const conv:Conversation={id,title:initialTitle,createdAt:now,updatedAt:now,messageCount:0,lastMessagePreview:''};
  persistentStorage.saveConversation(uid,conv);
  if(hasServiceAccount) await convRef(uid,id).set(conv);
  return conv;
}
export async function listConversations(uid:string){
  if(hasServiceAccount){ const snap=await userRef(uid).collection('conversations').orderBy('updatedAt','desc').get(); const list=snap.docs.map(d=>d.data() as Conversation); list.forEach(c=>persistentStorage.saveConversation(uid,c)); return list; }
  return persistentStorage.getUserConversations(uid);
}
export async function getConversation(uid:string,id:string){
  if(hasServiceAccount){ const s=await convRef(uid,id).get(); if(!s.exists)return null; const c=s.data() as Conversation; persistentStorage.saveConversation(uid,c); return c; }
  return persistentStorage.getConversation(uid,id);
}
export async function updateConversationTitle(uid:string,id:string,title:string){
  const clean=title.trim().slice(0,100); const now=new Date().toISOString();
  if(hasServiceAccount){ const ref=convRef(uid,id); const snap=await ref.get(); if(!snap.exists)return null; await ref.set({title:clean,updatedAt:now},{merge:true}); const c={...(snap.data() as Conversation),title:clean,updatedAt:now}; persistentStorage.saveConversation(uid,c); return c; }
  return persistentStorage.updateConversation(uid,id,{title:clean});
}
export async function deleteConversation(uid:string,id:string){ persistentStorage.deleteConversation(uid,id); if(hasServiceAccount) await convRef(uid,id).delete(); }
export async function addMessage(uid:string,id:string,role:'user'|'assistant'|'system',content:string,model?:string){
  const now=new Date().toISOString(); const msg:ChatMessage={id:'m_'+crypto.randomUUID(),role,content,createdAt:now,...(model ? {model} : {})};
  const conv=await getConversation(uid,id); if(!conv) throw new Error('Conversation not found');
  const updates:Partial<Conversation>={updatedAt:now,messageCount:(conv.messageCount||0)+1,lastMessagePreview:content.slice(0,80)};
  if(role==='user' && (conv.messageCount===0 || conv.title==='New Conversation' || conv.title==='New Chat')) updates.title=content.trim().slice(0,60)||'New Chat';
  persistentStorage.addMessage(id,msg); persistentStorage.updateConversation(uid,id,updates);
  if(hasServiceAccount){ await convRef(uid,id).collection('messages').doc(msg.id).set(msg); await convRef(uid,id).set(updates,{merge:true}); }
  if((conv.messageCount||0)>10 && (conv.messageCount||0)%8===0) updateConversationSummaryInBackground(uid,id).catch(()=>{});
  return msg;
}
async function updateConversationSummaryInBackground(uid:string,id:string){
  const messages=await getConversationMessages(uid,id,30); const summary=await generateConversationSummary(messages.map(m=>({role:m.role,content:m.content}))); if(!summary)return;
  if(hasServiceAccount) await convRef(uid,id).set({summary,updatedAt:new Date().toISOString()},{merge:true});
  persistentStorage.updateConversation(uid,id,{summary});
}
export async function getConversationMessages(uid:string,id:string,limitCount=50){
  if(hasServiceAccount){ const snap=await convRef(uid,id).collection('messages').orderBy('createdAt','asc').limit(limitCount).get(); const list=snap.docs.map(d=>d.data() as ChatMessage); return list; }
  return persistentStorage.getMessages(id,limitCount);
}
export async function deleteMessage(uid:string,id:string,messageId:string){
  if(hasServiceAccount) await convRef(uid,id).collection('messages').doc(messageId).delete();
  persistentStorage.deleteMessage(id,messageId);
  const conv=await getConversation(uid,id); if(conv){ const next=Math.max(0,(conv.messageCount||0)-1); persistentStorage.updateConversation(uid,id,{messageCount:next}); if(hasServiceAccount) await convRef(uid,id).set({messageCount:next,updatedAt:new Date().toISOString()},{merge:true}); }
}
export async function getUserMemory(uid:string){
  if(hasServiceAccount){ const snap=await userRef(uid).collection('memory').doc('profile').get(); if(snap.exists){const m=snap.data() as UserMemory; persistentStorage.saveUserMemory(uid,m); return m;} }
  return persistentStorage.getUserMemory(uid);
}
export async function updateUserMemory(uid:string,updates:Partial<UserMemory>){
  const current=await getUserMemory(uid); const updated:UserMemory={...current,...updates,updatedAt:new Date().toISOString()}; persistentStorage.saveUserMemory(uid,updated); if(hasServiceAccount) await userRef(uid).collection('memory').doc('profile').set(updated,{merge:true}); return updated;
}
export async function addMemoryFact(uid:string,fact:string){ const current=await getUserMemory(uid); if(!current.enabled)return current; const trimmed=fact.trim(); if(!trimmed||current.facts.includes(trimmed))return current; return updateUserMemory(uid,{facts:[...current.facts,trimmed].slice(-20)}); }
export async function deleteMemoryFact(uid:string,index:number){ const current=await getUserMemory(uid); if(index<0||index>=current.facts.length)return current; return updateUserMemory(uid,{facts:current.facts.filter((_,i)=>i!==index)}); }
export async function clearAllMemory(uid:string){ return updateUserMemory(uid,{facts:[]}); }
