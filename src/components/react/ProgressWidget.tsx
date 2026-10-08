import { useEffect,useState } from 'react';
export default function ProgressWidget(){
  const [t,setT]=useState(0),[p,setP]=useState(0);
  useEffect(()=>{
    function refresh(){try{const data=JSON.parse(localStorage.getItem('sales-os-v2')||'{}');setT(Object.values(data.lessonStatuses||{}).filter(x=>x==='theory_completed'||x==='mastered').length);setP(Object.values(data.practiceStatuses||{}).filter(x=>x==='completed'||x==='self_reviewed').length);}catch{}}
    refresh();window.addEventListener('salesstatechange',refresh);return()=>window.removeEventListener('salesstatechange',refresh);
  },[]);
  return <div className="stat-grid" aria-label="Прогресс обучения">
    <div className="stat"><div className="label">Пройдено теории</div><div className="value">{t} / 336</div><div className="label">336 уроков</div></div>
    <div className="stat"><div className="label">Практика</div><div className="value">{p} / 72</div><div className="label">72 задания</div></div>
    <div className="stat"><div className="label">Общий прогресс</div><div className="value">{Math.round((t+p)/408*100)}%</div><div className="progress"><span style={{width:Math.round((t+p)/408*100)+'%'}}/></div></div>
  </div>;
}
