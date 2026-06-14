import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'F:/NoCode/Gym/Treino Rayza Alvarez.pdf';

async function extractText() {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      fullText += `--- Page ${i} ---\n${pageText}\n`;
    }
    
    console.log(fullText);
  } catch (err) {
    console.error('Error parsing PDF:', err);
  }
}

extractText();
