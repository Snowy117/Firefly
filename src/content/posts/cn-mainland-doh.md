---
title: 中国大陆可用DNS over HTTPS
published: 2025-12-10
pinned: false
description: 出于一些神奇的原因，中国大陆内许多DNS over HTTPS服务是无法访问的，这里给一些或许有用的服务器。
tags: [DNS, 网络, 网络安全]
category: 技术
author: 雪纷飞
draft: false
date: 2025-12-10
image: api
---

1. 101DNS: `https://101.102.103.104/dns-query`
    :::warning
    需要忽略HTTPS证书错误。
    :::
    > __足够快！__
2. v.recipes: 
    - Cloudflare上游: `https://v.recipes/dns-query`
    - Google上游: `https://v.recipes/dns/dns.google/dns-query`
    - ……请参见[官方文档](https://v.recipes/)。
    > __足够快！__
3. Cloudflare
    - `https://cloudflare-dns.com/dns-query`是无法使用的，但可以用`https://<anything>.cloudflare-gateway.com/dns-query`代替。
    - 同理还有family和security: `https://<anything>.family.cloudflare-dns.com/dns-query`和`https://<anything>.security.cloudflare-dns.com/dns-query`。
    :::tip
    本人自用，强烈推荐！
    :::
    > __足够快！__
4. DNS for Family: `https://dns-doh.dnsforfamily.com/dns-query`
5. Caliph: `https://dns.caliph.dev/dns-query`
    > 印度尼西亚。
6. OpenBLD.net DNS: `https://ada.openbld.net/dns-query`
7. Rabit DNS: `https://dns.rabbitdns.org/dns-query`
8. Surfshark DNS: `https://dns.surfsharkdns.com/dns-query`
9. CIRA Canadian Shield DNS: `https://private.canadianshield.cira.ca/dns-query`
10. CZ.NIC ODVR: `https://odvr.nic.cz/doh`
11. JupitrDNS: `https://dns.jupitrdns.com/dns-query`
12. SWITCH DNS: `https://dns.switch.ch/dns-query`
13. UK DNS Privacy Project: `https://resolver.dnsprivacy.org.uk/dns-query`
14. BlackMagicc DNS: `https://rx.techomespace.com/dns-query`
15. NWPS.fi DNS: `https://public.ns.nwps.fi/dns-query`
16. 清华大学 TUNA 协会 DNS: `https://[2402:f000:1:416:101:6:6:6]:8443`
    > 好慢啊。