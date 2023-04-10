接受一个csv文件，表格头包含 question 和 answer。question 代表问题，answer 代表答案。 
导入前会进行去重，如果问题和答案完全相同，则不会被导入，所以最终导入的内容可能会比文件的内容少。  
| question | answer |
| --- | --- | 
| 什么是 laf  | laf 是一个云函数开发平台…… |
| 什么是 sealos | Sealos 是以 kubernetes 为内核的云操作系统发行版,可以…… |
