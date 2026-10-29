import {mkdir,readdir,copyFile} from 'node:fs/promises';
const dest='public/ocr';await mkdir(dest,{recursive:true});
await copyFile('node_modules/tesseract.js/dist/worker.min.js',`${dest}/worker.min.js`);
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs',`${dest}/pdf.worker.min.mjs`);
for(const file of await readdir('node_modules/tesseract.js-core'))if(file.endsWith('.wasm.js')||file.endsWith('.wasm'))await copyFile(`node_modules/tesseract.js-core/${file}`,`${dest}/${file}`);
await copyFile('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',`${dest}/eng.traineddata.gz`);
for(const [folder,name] of [['tesseract.js','tesseract-license.txt'],['tesseract.js-core','core-license.txt'],['pdfjs-dist','pdfjs-license.txt']]){const file=(await readdir(`node_modules/${folder}`)).find(f=>/^LICENSE/i.test(f));if(!file)throw new Error(`Missing license for ${folder}`);await copyFile(`node_modules/${folder}/${file}`,`${dest}/${name}`);}
console.log('Prepared same-origin document-reading workers and English model from pinned dependencies.');
