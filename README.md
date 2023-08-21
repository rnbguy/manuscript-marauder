# manuscript-marauder

Download manuscripts using a (socks5) proxy or open-access server.

## Requirement

[Deno](https://deno.com) :sauropod:

## Usage

```
./marauder.ts -sp ssh://user@open-access-server 10.48550/arXiv.2302.13971
```

## Help

```
./marauder.ts -h

Usage:   marauder <doi>
Version: 0.1.0

Options:

  -h, --help              - Show this help.
  -V, --version           - Show the version number for this program.
  -p, --proxy    <proxy>  - Proxy server to use. Accepts ssh://<user@host> for `ssh -NTD 1234 user@host`.  (Default: "socks5://localhost:1234")
  -s, --stealth           - Use Puppeteer Stealth plugin.
  -d, --debug             - Set headless mode to false.
```
