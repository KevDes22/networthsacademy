import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/components/academy-public';
import { pageHead } from '@/lib/academy';
import hero from '@/assets/academy-learners.asset.json';
export const Route=createFileRoute('/')({head:()=>({...pageHead('Learn Digital Skills. Build Your Future.','Practical digital skills training from Networths Academy, an initiative of Networths Professional Services Foundation.'),meta:[...pageHead('Learn Digital Skills. Build Your Future.','Practical digital skills training from Networths Academy.').meta,{property:'og:image',content:hero.url},{name:'twitter:image',content:hero.url}]}),component:HomePage});
