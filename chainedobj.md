{
  "key": "..dht key..",
  "from": Identity, // may be null
  "to": Identity?,   // may be null
  "file": fileBuffer,
  "permission": Permission?, // permission associated with the stored obj
  "tx": {
    "id": idHex,
    "body": bitcoin.Transaction, // bitcoin transaction
    "addresses": {
      "from": ["addrHex", "addrHex"],
      "to": ["addrHex", "addrHex"]
    }
  },
  "parsed": {
    "data": {
      "name": "json",
      "value": { // the actual data stored on chain
        "firstName": "bill",
        "lastName": "ted"
      }
    },
    "attachments": [
      Buffer,
      ...
    ]
  }
}
