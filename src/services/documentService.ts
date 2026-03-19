import * as mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist";
import * as XLSX from "xlsx";

// Set up pdfjs worker with a fallback version
const PDFJS_VERSION = pdfjs.version || '4.0.379';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

export async function parseDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use convertToHtml to preserve tables and basic formatting
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error("Error parsing DOCX:", error);
    throw new Error("Word 文件解析失败，请确保文件未加密且格式正确。");
  }
}

export async function parsePdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item as any).str)
        .join(" ");
      fullText += pageText + "\n";
    }
    
    return fullText;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("PDF 文件解析失败，请确保文件未加密。");
  }
}

export async function parseExcel(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let fullHtml = "";
    
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const sheetHtml = XLSX.utils.sheet_to_html(worksheet);
      fullHtml += `<div class="excel-sheet"><h3>工作表: ${sheetName}</h3>${sheetHtml}</div><br/>`;
    });
    
    return fullHtml;
  } catch (error) {
    console.error("Error parsing Excel:", error);
    throw new Error("Excel 文件解析失败。");
  }
}

export async function parseDocument(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  
  if (extension === "docx" || extension === "doc") {
    return await parseDocx(file);
  } else if (extension === "pdf") {
    return await parsePdf(file);
  } else if (extension === "xlsx" || extension === "xls") {
    return await parseExcel(file);
  } else if (extension === "txt" || extension === "md") {
    return await file.text();
  } else {
    throw new Error("不支持的文件格式。目前支持 PDF, Word (docx), Excel (xlsx) 和 TXT。");
  }
}
