import {ArrowRight,Bell,FileCheck2,Fingerprint,FolderTree,History,LayoutDashboard,Play,Ruler,ShieldCheck,Stethoscope} from 'lucide-react';
import {Brand} from './common';
import {lazy,Suspense} from 'react';
import {ThemeToggle,type Theme} from './theme';
import {seed} from '../data/demo';
import type {Role} from '../domain/model';
import {makeT,roleLabelsHi,useUiLang} from './i18n';
import './landing.css';
const LandingJourney=lazy(()=>import('./LandingJourney').then(module=>({default:module.LandingJourney})));
const dataset=await seed();
const datasetLine=`${dataset.applications.length} synthetic dossiers · ${dataset.institutions.length} institutions · ${dataset.claims.length} claims · ${dataset.documents.length} evidence documents · ${dataset.events.length} recorded events`;
const stations:{role:Role;en:string;hi:string;blurb:string}[]=[
  {role:'institution',en:'Institution',hi:roleLabelsHi.institution,blurb:'Submit the record, answer corrections, keep evidence current.'},
  {role:'scrutiny_officer',en:'Scrutiny officer',hi:roleLabelsHi.scrutiny_officer,blurb:'Review claims against their evidence, one case at a time.'},
  {role:'evc_coordinator',en:'EVC coordinator',hi:roleLabelsHi.evc_coordinator,blurb:'Plan expert visits and reserve panels.'},
  {role:'regional_officer',en:'Regional officer',hi:roleLabelsHi.regional_officer,blurb:'Decide with a recorded basis and a receipt.'},
  {role:'national_admin',en:'National administrator',hi:roleLabelsHi.national_admin,blurb:'Watch every station and inspect the audit trail.'},
];
const modules:{route:string;label:string;icon:typeof LayoutDashboard}[]=[
  {route:'overview',label:'Priority queue',icon:LayoutDashboard},
  {route:'case/demo-app-0',label:'Dossier & claims',icon:FolderTree},
  {route:'visits',label:'Verification visits',icon:Stethoscope},
  {route:'receipt/demo-app-5',label:'Decision receipt',icon:FileCheck2},
  {route:'compliance',label:'Obligation register',icon:Ruler},
  {route:'audit',label:'Audit logs',icon:History},
  {route:'trust',label:'Trust Center',icon:Fingerprint},
  {route:'alerts',label:'Alerts',icon:Bell},
];
export function Welcome({onEnter,onStory,onOpen,onEnterAs,theme,toggleTheme}:{onEnter:()=>void;onStory:()=>void;onOpen:(route:string)=>void;onEnterAs:(role:Role)=>void;theme:Theme;toggleTheme:()=>void}){
  const t=makeT(useUiLang());
  return <div className="landing-page">
    <a className="landing-skip" href="#landing-content" onClick={event=>{event.preventDefault();document.getElementById('landing-content')?.focus();}}>{t('Skip to content','सामग्री पर जाएँ')}</a>
    <header className="landing-header"><Brand/><div className="landing-header-actions"><span className="landing-demo-label"><span/>{t('Synthetic demo','सिंथेटिक डेमो')}</span><ThemeToggle theme={theme} toggleTheme={toggleTheme} className="landing-theme"/><button className="landing-entry" type="button" onClick={onEnter}>{t('Enter workspace','कार्यक्षेत्र में प्रवेश')} <ArrowRight size={15} aria-hidden="true"/></button></div></header>
    <main id="landing-content" className="landing-content" tabIndex={-1}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-eyebrow"><FolderTree size={14} aria-hidden="true"/>{t('An accountable path through approval','अनुमोदन प्रक्रिया में उत्तरदायी मार्ग')}</p>
          <h1 id="landing-title"><span>{t('The file moves.','फ़ाइल आगे बढ़ती है.')}</span><span>{t('The record stays.','रिकॉर्ड पीछे रहता है.')}</span></h1>
          <p className="landing-intro">Evidence, corrections, and the people responsible for the next step. One shared record from the first submission to the final review.</p>
          <p className="landing-tagline">{t('Policy into process.','नीति से प्रक्रिया तक।')}</p>
          <div className="landing-actions"><button type="button" className="landing-primary" onClick={onEnter}>{t('Open demo workspace','डेमो कार्यक्षेत्र खोलें')} <ArrowRight size={17} aria-hidden="true"/></button><button type="button" className="landing-tour" onClick={onStory}><Play size={15} aria-hidden="true"/>{t('Take a guided tour','निर्देशित टूर लें')}</button></div>
          <p className="landing-disclosure">{t('SIH26262 prototype. Synthetic cases only.','SIH26262 प्रोटोटाइप. केवल सिंथेटिक केस.')}<br/>{t('No real institutional data or approval decisions.','कोई वास्तविक संस्थागत डेटा या अनुमोदन निर्णय नहीं.')}</p>
          <ul className="landing-proof" aria-label={t('Core workflow capabilities','मुख्य कार्य-प्रवाह क्षमताएँ')}><li><FileCheck2 size={16} aria-hidden="true"/>{t('Versioned evidence','संस्करणबद्ध साक्ष्य')}</li><li><ShieldCheck size={16} aria-hidden="true"/>{t('Human review','मानवीय समीक्षा')}</li><li><History size={16} aria-hidden="true"/>{t('Recorded history','रिकॉर्ड किया इतिहास')}</li></ul>
        </div><Suspense fallback={<div className="landing-journey-loading" role="status">{t('Loading review illustration…','समीक्षा चित्रण लोड हो रहा है…')}</div>}><LandingJourney/></Suspense>
      </section>
      <section className="landing-continuity" aria-labelledby="landing-continuity-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">{t('How the record holds up','रिकॉर्ड ऐसे टिकता है')}</p><h2 id="landing-continuity-title">{t('A correction should move the case forward, not erase its past.','संशोधन केस आगे बढ़ाए, पीछे का इतिहास मिटाए नहीं.')}</h2></div>
        <div className="landing-principles">
          <article><FolderTree size={21} aria-hidden="true"/><h3>{t('Corrections that erase their past.','संशोधन जो पीछे का मिटा देते हैं.')}</h3><p>{t('Here a correction is a thread: the observation, the remedy, and the linked evidence version stay together, and acceptance is a separate review.','यहाँ संशोधन एक थ्रेड है: अवलोकन, उपाय, और जुड़ा साक्ष्य संस्करण साथ रहते हैं, और स्वीकृति अलग समीक्षा है.')}</p><span className="landing-surface-chip">{t('Dossier · Claim ledger','डोज़ियर · दावा बहीखाता')}</span></article>
          <article><History size={21} aria-hidden="true"/><h3>{t('Reviews without a numbered trail.','समीक्षाएँ जिनमें क्रमबद्ध ट्रेल नहीं.')}</h3><p>{t('Every action appends an audit entry with actor, role, reason, and workflow version. The Trust Center exposes the security state of the evidence.','हर क्रिया ऑडिट प्रविष्टि जोड़ती है जिसमें कर्ता, भूमिका, कारण, और वर्कफ़्लो संस्करण होता है. ट्रस्ट सेंटर साक्ष्य की सुरक्षा अवस्था दिखाता है.')}</p><span className="landing-surface-chip">{t('Audit logs · Trust Center','ऑडिट लॉग · ट्रस्ट सेंटर')}</span></article>
          <article><ShieldCheck size={21} aria-hidden="true"/><h3>{t('Obligations that fade at approval.','शर्तें जो अनुमोदन पर फीकी पड़ जाती हैं.')}</h3><p>{t('Approval scope and continuing conditions keep their own register with deadlines after the case closes.','अनुमोदन दायरा और निरंतर शर्तें केस बंद होने के बाद भी अपने रजिस्टर में समय-सीमाओं के साथ रहते हैं.')}</p><span className="landing-surface-chip">{t('Obligation register','अपालन रजिस्टर')}</span></article>
        </div>
      </section>
      <section className="landing-stations" aria-labelledby="landing-stations-title">
        <div className="landing-section-heading"><p className="landing-eyebrow">{t('Walk the stations','स्थानों से गुज़रें')}</p><h2 id="landing-stations-title">{t('Carry the same record across every role.','वही रिकॉर्ड हर भूमिका में।')}</h2></div>
        <div className="landing-station-grid">
          {stations.map(station=><button type="button" key={station.role} className="landing-station" onClick={()=>onEnterAs(station.role)}>
            <strong>{t(station.en,station.hi)}</strong>
            <span>{station.blurb}</span>
            <ArrowRight size={15} aria-hidden="true"/>
          </button>)}
        </div>
        <div className="landing-module-grid" aria-label={t('Workspace surfaces','कार्यक्षेत्र सतहें')}>
          {modules.map(module=><button type="button" key={module.route} className="landing-module" onClick={()=>onOpen(module.route)}><module.icon size={15} aria-hidden="true"/>{t(module.label,module.label)}</button>)}
        </div>
        <p className="landing-dataset" role="note">{t('Synthetic dataset','सिंथेटिक डेटासेट')}: {datasetLine}. {t('Checked by unit, SQL, and end-to-end tests.','यूनिट, SQL, और एंड-टू-एंड परीक्षणों से जाँचा गया.')}</p>
      </section>
    </main>
    <footer className="landing-footer"><span>Clauseway <span aria-hidden="true">/</span> {t('Evidence review, with a record.','साक्ष्य समीक्षा, रिकॉर्ड के साथ.')}</span><span><ShieldCheck size={14} aria-hidden="true"/>{t('Independent prototype. No real approval authority.','स्वतंत्र प्रोटोटाइप. कोई वास्तविक अनुमोदन अधिकारी नहीं.')}</span></footer>
  </div>;
}
