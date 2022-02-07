const bodyParser = require('body-parser');
const express = require('express');
const Canvas = require('canvas');
const multer = require('multer');
const json = bodyParser.json();
const urlencoded = bodyParser.urlencoded({extended:true});
const api = express();
const path = require('path');
const fs = require('fs');
const assert = require('assert')
api.disable('x-powered-by');
api.use(json);
api.use(urlencoded);
const pdfjs = require('pdfjs-dist/legacy/build/pdf');
const pdfUpload = multer({dest:'temp/'});
function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, "Invalid canvas size");
    var canvas = Canvas.createCanvas(width, height);
    var context = canvas.getContext("2d");
    return {
      canvas: canvas,
      context: context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, "Canvas is not specified");
    assert(width > 0 && height > 0, "Invalid canvas size");
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, "Canvas is not specified");

    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};
const cleanup = (file) =>{
    try {
        fs.unlink(file.path, (err) => {
            if(err) throw(`could not delete ${file.filename}`)
        })
    } catch (error) {
        console.log(error)
    } 
}
api.use('/',pdfUpload.single('pdf'));
api.post('/', async (req,res,next)=>{
    if(req.file == undefined) return next(new Error('No File!'));
    const {originalname,filename,path,mimetype} = req.file;
    
    try {
        let doc = await pdfjs.getDocument(path).promise;
        let pageCount = doc.numPages;
        while (pageCount > 0){
            const page = await doc.getPage(pageCount);
            const canvasFactory = new NodeCanvasFactory();
            const viewport = page.getViewport({scale:1.5});
            let canvasAndContext = canvasFactory.create(
                viewport.width,
                viewport.height
            );
            let renderContext =  {
                canvasContext:canvasAndContext.context,
                viewport:viewport,
                canvasFactory:canvasFactory
            }
            await page.render(renderContext).promise;
            let image = canvasAndContext.canvas.toBuffer();
            const filenameNoExt = req.file.originalname.split('.').shift();
            const imageData = Buffer.from(image,'base64');
            fs.writeFileSync(`output/${filenameNoExt}-${pageCount}.png`,imageData,(err)=>{
              if (err) console.log(`error making image: ${err.message}`)
            });
            const content = await page.getTextContent();
            const strings = content.items.map(function(item){
                return item.str;
            }).join(" ");
            fs.writeFileSync(`output/${filenameNoExt}-${pageCount}.txt`,strings);
            pageCount --;
        }
       
    } catch (e) {
        return next(new Error(e));
    }
    //cleanup     
    cleanup(req.file)
    res.json({success:true})
});
api.use((err,req,res,next)=>{
    
    if(err) {
        res.statusCode = err.statusCode || 400;
        res.json({error:err.message || 'Something went wrong with your request'});
    
    }
    //cleanup temp files
   cleanup(req.file)
});
api.listen(3000,()=>{
    console.log(`PDF EDIT API STARTED ON PORT 3000`)
});