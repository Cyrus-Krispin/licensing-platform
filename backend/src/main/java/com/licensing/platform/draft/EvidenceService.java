package com.licensing.platform.draft;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;
import javax.sql.DataSource;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class EvidenceService {
 static final long MAX_BYTES=10_000_000;
 private final JdbcTemplate db; private final TransactionTemplate tx; private final Path root; private final boolean postgres;
 EvidenceService(JdbcTemplate db,TransactionTemplate tx,DataSource ds,@Value("${licensing.file-storage-path:./data/private-files}") String path)throws Exception{
  this.db=db;this.tx=tx;root=Path.of(path).toAbsolutePath().normalize();Files.createDirectories(root.resolve("staging"));Files.createDirectories(root.resolve("objects"));
  try(var c=ds.getConnection()){postgres="PostgreSQL".equals(c.getMetaData().getDatabaseProductName());}
 }
 public UploadResult upload(UUID app,UUID request,String actor,long expected,String key,MultipartFile part){
  if(key==null||key.isBlank()||key.length()>100)bad("Idempotency-Key must contain 1–100 characters");
  access(app,request,actor,false); // authorization precedes reading/staging bytes
  byte[] bytes=read(part);String filename=sanitize(part.getOriginalFilename());String type=validate(bytes,filename,part.getContentType());String hash=hex(bytes);
  String fingerprint=hex((hash+"\0"+filename+"\0"+type).getBytes(StandardCharsets.UTF_8));UUID id=UUID.randomUUID();String storage=UUID.randomUUID().toString();
  Path staging=root.resolve("staging").resolve(storage+".part"),target=root.resolve("objects").resolve(storage);
  try{Files.write(staging,bytes);try{Files.move(staging,target,StandardCopyOption.ATOMIC_MOVE);}catch(AtomicMoveNotSupportedException e){Files.move(staging,target);}
   try{UploadResult result=tx.execute(s->commit(app,request,actor,expected,key,fingerprint,id,storage,filename,type,bytes.length,hash));if(!result.upload.id.equals(id))quiet(target);return result;}
   catch(RuntimeException e){quiet(target);throw e;}
  }catch(IOException e){quiet(staging);quiet(target);throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"storage_failure","The file could not be stored. Your previous file is unchanged; retry with the same key.");}
 }
 private UploadResult commit(UUID app,UUID request,String actor,long expected,String key,String fingerprint,UUID id,String storage,String filename,String type,long size,String hash){
  lock(actor,app,request,key);var old=receipt(actor,app,request,key);
  if(old.isPresent()){if(!old.get().hash.equals(fingerprint))throw new ApiException(HttpStatus.CONFLICT,"idempotency_conflict","That retry key was already used with a different file or filename");return new UploadResult(load(old.get().upload,app,actor),old.get().revision);}
  var access=access(app,request,actor,true);if(access.revision!=expected)throw new ApiException(HttpStatus.CONFLICT,"stale_revision","This draft changed elsewhere. Reload it; your local form values have been retained.");
  db.update("insert into evidence_upload(id,application_id,request_id,storage_key,original_filename,content_type,byte_size,sha256,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)",id,app,request,storage,filename,type,size,hash,actor,Timestamp.from(Instant.now()));
  db.update("update document_request set current_upload_id=? where id=? and application_id=?",id,request,app);db.update("update application_draft set revision=revision+1,updated_at=? where id=? and revision=?",Timestamp.from(Instant.now()),app,expected);
  long revision=expected+1;db.update("insert into evidence_upload_retry(actor_username,application_id,request_id,idempotency_key,payload_hash,upload_id,resulting_revision) values(?,?,?,?,?,?,?)",actor,app,request,key,fingerprint,id,revision);
  return new UploadResult(load(id,app,actor),revision);
 }
 public Download download(UUID app,UUID upload,String actor){Upload u=load(upload,app,actor);Path p=root.resolve("objects").resolve(u.storageKey).normalize();if(!p.startsWith(root.resolve("objects"))||!Files.isRegularFile(p))throw integrity();try{return new Download(u,new InputStreamResource(Files.newInputStream(p)));}catch(IOException e){throw integrity();}}
 private Access access(UUID app,UUID request,String actor,boolean lock){String suffix=lock?(postgres?" for update of d, r":" for update"):"";var found=db.query("select d.revision,r.applicability from application_draft d join document_request r on r.application_id=d.id where d.id=? and r.id=? and d.owner_username=? and d.status='DRAFT'"+suffix,(rs,n)->new Access(rs.getLong(1),rs.getString(2)),app,request,actor).stream().findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"not_found","Draft evidence request not found"));if(!found.applicability.equals("APPLICABLE"))throw new ApiException(HttpStatus.CONFLICT,"request_not_applicable","Evidence is not currently required for this request");return found;}
 private Upload load(UUID id,UUID app,String actor){return db.query("select u.id,u.request_id,u.storage_key,u.original_filename,u.content_type,u.byte_size,u.sha256,u.created_at from evidence_upload u join application_draft d on d.id=u.application_id where u.id=? and u.application_id=? and d.owner_username=?",(rs,n)->new Upload(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),rs.getString(3),rs.getString(4),rs.getString(5),rs.getLong(6),rs.getString(7),rs.getTimestamp(8).toInstant()),id,app,actor).stream().findFirst().orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"not_found","File not found"));}
 private byte[] read(MultipartFile p){if(p==null||p.isEmpty())bad("Choose a nonempty PDF, JPEG, or PNG file");if(p.getSize()>MAX_BYTES)bad("Files must be no larger than 10,000,000 bytes");try(var in=p.getInputStream()){byte[] b=in.readNBytes((int)MAX_BYTES+1);if(b.length==0)bad("Choose a nonempty PDF, JPEG, or PNG file");if(b.length>MAX_BYTES)bad("Files must be no larger than 10,000,000 bytes");return b;}catch(IOException e){throw invalid("The uploaded file could not be read");}}
 private String validate(byte[] b,String name,String supplied){String ext=name.substring(name.lastIndexOf('.')+1).toLowerCase(Locale.ROOT);String type;if(starts(b,"%PDF-".getBytes(StandardCharsets.US_ASCII)))type="application/pdf";else if(starts(b,new byte[]{-119,80,78,71,13,10,26,10}))type="image/png";else if(starts(b,new byte[]{-1,-40,-1}))type="image/jpeg";else throw invalid("File contents are not a supported PDF, JPEG, or PNG");String expected=switch(ext){case"pdf"->"application/pdf";case"jpg","jpeg"->"image/jpeg";case"png"->"image/png";default->null;};if(!type.equals(expected))throw invalid("The filename extension does not match the detected file format");if(supplied!=null&&!supplied.isBlank()&&!Set.of(type,"application/octet-stream").contains(supplied.toLowerCase(Locale.ROOT)))throw invalid("The supplied content type does not match the detected file format");try{if(type.equals("application/pdf")){try(PDDocument d=Loader.loadPDF(b)){if(d.isEncrypted())throw invalid("Encrypted or password-protected PDFs are not accepted");if(d.getNumberOfPages()<1||d.getNumberOfPages()>2000)throw invalid("PDF must contain 1–2,000 pages");}}else parseImage(b);}catch(ApiException e){throw e;}catch(Exception e){throw invalid("The file is damaged, unsupported, or cannot be structurally parsed");}return type;}
 private void parseImage(byte[] b)throws IOException{try(ImageInputStream in=ImageIO.createImageInputStream(new ByteArrayInputStream(b))){var it=ImageIO.getImageReaders(in);if(!it.hasNext())throw invalid("The image cannot be decoded");var r=it.next();try{r.setInput(in,true,true);int w=r.getWidth(0),h=r.getHeight(0);if(w<1||h<1||w>20000||h>20000||(long)w*h>100_000_000)throw invalid("Image dimensions are outside the supported bounds");BufferedImage image=r.read(0);if(image==null)throw invalid("The image cannot be decoded");}finally{r.dispose();}}}
 private String sanitize(String raw){String n=Optional.ofNullable(raw).orElse("upload").replace('\\','/');n=n.substring(n.lastIndexOf('/')+1).replaceAll("[\\p{Cntrl}]","").trim();if(n.isBlank())n="upload";return n.length()>255?n.substring(n.length()-255):n;}
 private void lock(String actor,UUID app,UUID req,String key){if(postgres){long value=ByteBuffer.wrap(digest((actor+app+req+key).getBytes(StandardCharsets.UTF_8))).getLong();db.query("select pg_advisory_xact_lock(?)",rs->null,value);}}
 private Optional<Receipt> receipt(String actor,UUID app,UUID req,String key){return db.query("select payload_hash,upload_id,resulting_revision from evidence_upload_retry where actor_username=? and application_id=? and request_id=? and idempotency_key=?",(rs,n)->new Receipt(rs.getString(1),rs.getObject(2,UUID.class),rs.getLong(3)),actor,app,req,key).stream().findFirst();}
 private static boolean starts(byte[]v,byte[]p){if(v.length<p.length)return false;for(int i=0;i<p.length;i++)if(v[i]!=p[i])return false;return true;}private static byte[]digest(byte[]b){try{return MessageDigest.getInstance("SHA-256").digest(b);}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}private static String hex(byte[]b){return HexFormat.of().formatHex(digest(b));}private static void quiet(Path p){try{Files.deleteIfExists(p);}catch(IOException ignored){}}private static void bad(String m){throw new ApiException(HttpStatus.BAD_REQUEST,"invalid_file",m);}private static ApiException invalid(String m){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"invalid_file",m);}private static ApiException integrity(){return new ApiException(HttpStatus.CONFLICT,"file_integrity_failure","The retained file is temporarily unavailable. No replacement was made.");}
 private record Access(long revision,String applicability){}private record Receipt(String hash,UUID upload,long revision){}
 public record Upload(UUID id,UUID requestId,@JsonIgnore String storageKey,String filename,String contentType,long byteSize,String sha256,Instant createdAt){}public record UploadResult(Upload upload,long revision){}public record Download(Upload upload,InputStreamResource resource){}
}
