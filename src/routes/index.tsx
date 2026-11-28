import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/components/academy-public';
import { academyHeroImage, pageHead } from '@/lib/academy';
export const Route=createFileRoute('/')({head:()=>({...pageHead('Learn Digital Skills. Build Your Future.','Practical digital skills training from Networths Academy, an initiative of Networths Professional Services Foundation.'),meta:[...pageHead('Learn Digital Skills. Build Your Future.','Practical digital skills training from Networths Academy.').meta,{property:'og:image',content:academyHeroImage},{name:'twitter:image',content:academyHeroImage}]}),component:HomePage});
