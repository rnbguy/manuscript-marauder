# manuscript-marauder

Download manuscripts using a (socks5) proxy or open-access server.

## Requirement

[Deno](https://deno.com) :sauropod:

## Usage

### CLI

```
./cli.ts -p ssh://user@open-access-server 10.48550/arXiv.2302.13971
```

or simply, call the script remotely,

```
deno run -A https://github.com/rnbguy/manuscript-marauder/raw/main/cli.ts -p ssh://user@open-access-server 10.48550/arXiv.2302.13971
```

### Server

```
PROXY=ssh://user@open-access-server deno run -A server.ts
```

## Help

```
./cli.ts -h

Usage:   marauder <doi>
Version: 0.1.0

Options:

  -h, --help                - Show this help.
  -V, --version             - Show the version number for this program.
  -p, --proxy    <proxy>    - Proxy server to use. Accepts ssh://<user@host> for `ssh -NTD 1234 user@host`.  (Default: "socks5://localhost:1234")
  -o, --output   <output>   - Output file name. Defaults to <doi>.pdf
  -b, --backend  <backend>  - Backend to use.                                                                (Default: "astral", Values: "astral", "puppeteer")
```
