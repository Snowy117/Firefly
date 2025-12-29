---
title: 配合Mihomo的Tun模式，让Hyper-V虚拟机正常通过IPv6上网
pinned: false
description: Windows的NAT和ICS对IPv6的支持就是完全没有支持。让我们来亲自实现吧！
tags: [网络, 代理]
category: 技术
author: 雪纷飞
draft: false
# updated: 2026-10-10
published: 2025-12-27
image: "api"
---

说在前面：文章构建的方案属于三层路由（L3 Routing），而非NAT。但总之能够运行就可以了嘛！

# 目的

本文的目的是放弃Hyper-V提供的“Default Switch”交换机，自行构建网络，使得虚拟机能够通过IPv4和IPv6双栈上网。例如，能够访问[Google-IPv6](https://ipv6.google.com)。

:::NOTE
因此，实际上本文也会给虚拟机配置一个IPv4网络，同时还会解决[《TUN与Hyper-V和谐共处》][harmony-hyperv-mihomo]中提到的问题。不要看着标题就认为是只和IPv6相关呀！
:::

我们会把虚拟机的流量全部转发到网卡“Meta”上，这是[mihomo]的虚拟网卡。

:::WARNING
笔者没有在“以太网”“WLAN”上**进行任何测试**，只在[mihomo]环境内进行了测试！此外，笔者并不认为“以太网”“WLAN”可以完全照搬本文提供的方法。我们强烈建议你安装上[mihomo]并打开TUN模式，再进行操作。
:::

> 显然，你得确保你的物理网卡能够通过IPv6上网（[mihomo]中所有涉及`ipv6`的选项都设置为`true`），否则无论你怎么配置，虚拟机都不可能真正通过IPv6上网。

请确保您使用管理员权限的PowerShell来执行下面提到的命令。

先写好名字吧！

```ps1
# 虚拟交换机的名字
$VMSwitch   = "E1"
# 目标网卡的名字
$Target     = "Meta"
# $VMSwitch上分配的IP地址前缀
$PrefixIP4  = "192.168.77."
$PrefixIP6  = "fd00:1234:5678:1::"
# 物理机IP地址
$GatewayIP4 = $PrefixIP4 + "1"
$GatewayIP6 = $PrefixIP6 + "1"
```

# 创建虚拟交换机

下面的命令将创建一个名为“vEhternet (E1)”的虚拟交换机。

```ps1
New-VMSwitch -SwitchName $VMSwitch -SwitchType Internal
```

Windows的防火墙可能会把这个网卡拦下来，所以我们略做调整：

```ps1
$NetProfile = Get-NetConnectionProfile -InterfaceAlias "vEthernet ($VMSwitch)"
if ($NetProfile) {
    Set-NetConnectionProfile -InterfaceAlias "vEthernet ($VMSwitch)" -NetworkCategory Private
}
```

:::TIP
如果你正在使用卡巴斯基等杀毒软件，你可能需要调整杀毒软件内的防火墙规则。

据笔者所知，ESET有一条内置规则，会无条件允许虚拟机和主机的任何通信，并且ESET的内置规则会优先于Windows防火墙规则和ESET的用户规则。所以如果你使用ESET，那么无须对防火墙进行任何操作。
:::

# 创建IP地址

请在物理机中运行：

```ps1
New-NetIPAddress -IPAddress $GatewayIP4 `
                 -PrefixLength 24 `
                 -InterfaceAlias "vEthernet ($VMSwitch)"
New-NetIPAddress -IPAddress $GatewayIP6 `
                 -PrefixLength 64 `
                 -InterfaceAlias "vEthernet ($VMSwitch)"
```

这会给物理机分配IP地址。

# 配置虚拟机

把`$VMName`替换为相关的虚拟机的名字，然后在**物理机**中运行：

```ps1 ins="MyVM"
$VMName = "MyVM"
$NetworkAdapter = Get-VMNetworkAdapter -VMName $VMName
Connect-VMNetworkAdapter -VMNetworkAdapter $NetworkAdapter `
                         -SwitchName $VMSwitch
```

这会将我们刚才创建的虚拟交换机连接到虚拟机上。

然后，进入虚拟机，找到新接入的交换机的名称（请把高亮部分自行替换！）。然后在虚拟机中运行：

```ps1 ins="Ethernet 7" ins=/2(?=")/ {"不过，我不建议这个自动找网卡的方法，建议打开ncpa.cpl手动看，然后用看到的名字替换下面的高亮部分":11}
$VM_IP4_Suffix  = "2"    # 虚拟机 IPv4 最后一位，在2到254之间。
$VM_IP6_Suffix  = "2"    # 虚拟机 IPv6 最后一位，在2到0xfffe之间。
$PrefixIP4      = "192.168.77."        # 确保和主机的$PrefixIP4一样！
$PrefixIP6      = "fd00:1234:5678:1::" # 确保和主机的$PrefixIP6一样！
$StaticIP4      = $PrefixIP4 + $VM_IP4_Suffix
$GatewayIP4     = $PrefixIP4 + "1"
$StaticIP6      = $PrefixIP6 + $VM_IP6_Suffix
$GatewayIP6     = $PrefixIP6 + "1"
# 让我们找到那块可能的网卡
# $nic = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Virtual -eq $false } | Select-Object -Last 1

$nic = Get-NetAdapter -Name "Ethernet 7"
New-NetIPAddress -IPAddress $StaticIP4 `
                 -PrefixLength 24 `
                 -InterfaceIndex $nic.IfIndex `
                 -DefaultGateway $GatewayIP4
New-NetIPAddress -IPAddress $StaticIP6 `
                 -PrefixLength 64 `
                 -InterfaceIndex $nic.IfIndex `
                 -DefaultGateway $GatewayIP6
Set-DnsClientServerAddress -InterfaceIndex $nic.ifIndex `
                           -ServerAddresses ($GatewayIP4, $GatewayIP6)
```

:::TIP
注意，如果你的物理机没有监听53端口来提供DNS服务，并且没有使用[mihomo]的DNS劫持功能，那么你需要填写正确的DNS服务器（比方说`("223.5.5.5", "2400:3200::1")`），而非`($GatewayIP4, $GatewayIP6)`。

如果你打算使用[mihomo]的DNS分流（推荐！），那么记得让[mihomo]的DNS监听为`0.0.0.0:53`——不过不管怎么样，开启`dns-hijack`有利无弊：
```yaml
tun:
  enable: true
  dns-hijack:
    - "any:53"
    - "tcp://any:53"
  #...
```
:::

# 配置转发

现在虚拟机应该已经和主机进行网络连接了。你可以在虚拟机中运行下面的代码来测试。

```ps1
Test-Connection $GatewayIP4
Test-Connection $GatewayIP6
```

现在，返回物理机，运行下面的PowerShell脚本：

```ps1
Set-NetIPInterface -Forwarding Enabled -InterfaceAlias $Target
Set-NetIPInterface -Forwarding Enabled -InterfaceAlias "vEthernet ($VMSwitch)"
```

我们开启了`$Target`和`$VMSwitch`的转发（同时包含IPv4和IPv6）。

# 配置主机路由

如果你的网卡是[mihomo]之类的软件的TUN网卡，那么这样的软件会自动把路由给你装备好，**请跳过这个步骤**。

:::NOTE
记得给[mihomo]这样配置呀！否则[mihomo]会拒绝来自虚拟交换机的流量的！
```yaml ins={4}
tun:
  # ...
  include-interface:
    - "vEthernet (E1)"
    - "以太网"
    - "WLAN"
```
:::

什么？你的网卡不是[mihomo]的TUN网卡！那笔者帮不了你了。笔者也不知道应该怎么配路由才能让发出去的流量还能发回来。

> 当不使用TUN模式时，如果要让物理机转发来自虚拟机的 IPv6 流量，物理机需要充当路由器的角色。
> 得有回程路由才行。外部网络不知道 `fd00::/64` 在你的PC上。
> * [mihomo]的TUN模式之所以能工作，是因为它实际上做了一层**NAT/Masquerade**，它劫持了所有流量，让回程流量看起来是发给宿主机的。
> * 如果是纯物理路由，需要在上级路由器（比如家里的光猫/路由器）上写静态路由表，把`fd00::`指向你PC的IP。这又得是一笔烂账。并且，要是你的PC是个笔记本电脑，经常到处跑，总不可能每个路由器你都去改一遍吧？
> * 或者在Windows上启用NAT66，但Windows自带的NAT完全不带IPv6玩。所以这不才有了本文嘛！**~只要Windows带了NAT66，那不就是两行代码的事情，哪用得了配置这么多！~**

# 测试

现在是愉快的测试环节！

## 检查主机网卡状态

运行下面的命令！

```ps1
Get-NetIPInterface -InterfaceAlias $Target,"vEthernet ($VMSwitch)" | 
Select-Object InterfaceAlias,AddressFamily,Forwarding
```

你应该会看到这样的结果：

```txt "Enabled"
InterfaceAlias AddressFamily Forwarding
-------------- ------------- ----------
vEthernet (E1)          IPv6    Enabled
Meta                    IPv6    Enabled
vEthernet (E1)          IPv4    Enabled
Meta                    IPv4    Enabled
```

## 虚拟机网络测试

```ps1
$Servers = Resolve-DnsName "taobao.com"
$Server4 = $Servers | Where-Object Type -eq    A |
           Select-Object -First 1 -ExpandProperty IPAddress
$Server6 = $Servers | Where-Object Type -eq AAAA | 
           Select-Object -First 1 -ExpandProperty IPAddress
Invoke-WebRequest -Uri "https://$Server4/" `
                  -Method Head `
                  -SkipCertificateCheck `
                  -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri "https://[$Server6]/" `
                  -Method Head `
                  -SkipCertificateCheck `
                  -ErrorAction SilentlyContinue
```

你应该看到来自淘宝网的404错误：

```txt wrap
PS C:\> Invoke-WebRequest -Uri "https://$Server4/" -Method Head -SkipCertificateCheck -ErrorAction SilentlyContinue
Invoke-WebRequest: Response status code does not indicate success: 404 (Not Found).
PS C:\> Invoke-WebRequest -Uri "https://[$Server6]/" -Method Head -SkipCertificateCheck -ErrorAction SilentlyContinue
Invoke-WebRequest: Response status code does not indicate success: 404 (Not Found).
```


<!-- 引用 -->
[mihomo]: https://wiki.metacubex.one/ "mihomo官网"
[harmony-hyperv-mihomo]: /posts/harmony-hyperv-mihomo/ "TUN与Hyper-V"