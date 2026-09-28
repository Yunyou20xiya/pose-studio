export function showExportResult(notice,saved,label='参考图'){
 notice.className='good';notice.replaceChildren();
 const location=document.createElement('span');location.textContent=label+'已保存到：'+(saved.displayDirectory||saved.directory||saved.file);location.title=saved.file;
 const link=document.createElement('a');link.href=saved.url;link.target='_blank';link.rel='noopener';link.textContent='查看图片';link.className='export-result-link';
 notice.append(location,link);
}
