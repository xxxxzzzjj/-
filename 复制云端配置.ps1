param([ValidateSet('PrivateKey','SigningToken')][string]$Mode = 'PrivateKey')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if ([System.Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw '请使用 Windows PowerShell（STA）运行此脚本。' }
if ($Mode -eq 'SigningToken') {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes); $value = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_'); [System.Windows.Forms.Clipboard]::SetText($value) }
    finally { $rng.Dispose(); [Array]::Clear($bytes,0,$bytes.Length); $value = $null }
    Write-Host '独立发卡口令已复制到剪贴板。请粘贴到云函数 WEB_SIGNING_TOKEN，妥善保存，然后用其他文本覆盖剪贴板。'
    exit
}
$keyFile = Join-Path ([Environment]::GetFolderPath('Desktop')) 'LicensingAdmin\issuer.key.portable'
if (-not (Test-Path -LiteralPath $keyFile)) { throw '桌面 LicensingAdmin 中未找到 issuer.key.portable。请在原发行器所在电脑运行。' }
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
public static class PidanCloudKeyExport {
  public static string Open(string path, string password) {
    byte[] raw = File.ReadAllBytes(path), material = null, plain = null;
    if (raw.Length < 150 || raw.Length > 16384 || Encoding.ASCII.GetString(raw,0,5) != "DSHK1") throw new InvalidDataException("私钥备份格式不正确");
    try {
      byte[] salt = new byte[32], iv = new byte[16]; Buffer.BlockCopy(raw,5,salt,0,32); Buffer.BlockCopy(raw,37,iv,0,16);
      using (var kdf = new Rfc2898DeriveBytes(password,salt,250000,HashAlgorithmName.SHA256)) material = kdf.GetBytes(64);
      byte[] macKey = new byte[32], aesKey = new byte[32]; Buffer.BlockCopy(material,32,macKey,0,32); Buffer.BlockCopy(material,0,aesKey,0,32);
      byte[] tag; using (var mac = new HMACSHA256(macKey)) tag = mac.ComputeHash(raw,0,raw.Length-32);
      int diff = 0; for (int i=0;i<32;i++) diff |= tag[i] ^ raw[raw.Length-32+i];
      if (diff != 0) throw new CryptographicException("发行密码错误或私钥文件损坏");
      using (var aes = Aes.Create()) { aes.Key = aesKey; aes.IV = iv; using (var dec = aes.CreateDecryptor()) plain = dec.TransformFinalBlock(raw,53,raw.Length-85); }
      string xml = Encoding.UTF8.GetString(plain);
      using (var rsa = new RSACryptoServiceProvider()) { rsa.PersistKeyInCsp = false; rsa.FromXmlString(xml); if (rsa.PublicOnly || rsa.KeySize != 3072) throw new CryptographicException("私钥格式不正确"); }
      Array.Clear(macKey,0,macKey.Length); Array.Clear(aesKey,0,aesKey.Length);
      return xml;
    } finally { if(material!=null) Array.Clear(material,0,material.Length); if(plain!=null) Array.Clear(plain,0,plain.Length); }
  }
}
'@
Write-Host '将使用发行器现有私钥，不会生成新私钥。请输入现有发行密码。'
$secret = Read-Host -AsSecureString '发行密码'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $xml = [PidanCloudKeyExport]::Open($keyFile, $password)
    [System.Windows.Forms.Clipboard]::SetText($xml)
    Write-Host '签发私钥已复制到剪贴板。请只粘贴到云函数 LICENSE_PRIVATE_KEY_XML，完成后立即用其他文本覆盖剪贴板。'
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $password = $null; $xml = $null; $secret.Dispose() }
