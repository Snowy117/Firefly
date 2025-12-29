---
title: 解决TUN代理使Hyper V虚拟机断网
pinned: false
description: 当我们启用Clash的TUN模式后，VMware和Hyper-V如果使用的是NAT模式上网，那么内部的机器会有概率时不时断开网络，本文旨在解决这个问题。
tags: [网络, 代理]
category: 技术
author: 雪纷飞
draft: false
updated: 2025-12-27
published: 2025-12-20
image: "api"
---

__原因__：VMware/Hyper-V的默认上网配置（NAT/Default Switch）与Mihomo/Singbox/XRayCore等软件的TUN上网模式冲突。

__解决思路__：通过简单的手动配置VMware/Hyper-V的网卡，使他们走代理流量/直连。

# 方法一：桥接模式

既然是NAT冲突了，那么直接改成桥接就行了嘛！

<a id="method-two-set-adapter"></a>

# 方法二：配置网卡

如果你不能接受使用桥接模式上网，那么我们来手动配置网卡。下文以Hyper-V为例。

:::TIP
注意：本方法**无法提供IPv6支持**，如果你需要IPv6支持，请参考如下的博客：[让Hyper-V虚拟机通过IPv6上网][hyperv-ipv6]。

该博客也是更推荐的办法，你可以直接去阅读该博客，**无须阅读本文**。

雪纷飞，2025年12月27日。
:::

## 一、找到TUN网卡

TUN网卡一般有比较明显的名字，例如，Mihomo（Clash内核）的默认TUN网卡名字是`Meta`。

你可以使用下面的PowerShell命令来列出所有的网卡：

```txt title="PowerShell"
PS C:\> Get-NetAdapter

Name                      InterfaceDescription                    ifIndex Status       MacAddress             LinkSpeed
----                      --------------------                    ------- ------       ----------             ---------
蓝牙网络连接                Bluetooth Device (Personal Area Networ…      23 Disconnected XX-XX-XX-XX-XX-XX         3 Mbps
vEthernet (E0)            Hyper-V Virtual Ethernet Adapter #2          17 Up           XX-XX-XX-XX-XX-XX        10 Gbps
vEthernet (Default Switc… Hyper-V Virtual Ethernet Adapter             54 Up           XX-XX-XX-XX-XX-XX        10 Gbps
以太网                     Realtek PCIe GbE Family Controller            7 Up           XX-XX-XX-XX-XX-XX         1 Gbps
WLAN                      Realtek 8852CE WiFi 6E PCI-E NIC              5 Disconnected XX-XX-XX-XX-XX-XX     144.4 Mbps
Meta                      Meta Tunnel                                  51 Up                                   100 Gbps
```

观察`InterfaceDescription`即可轻松发现，我们的TUN网卡应该是`Meta`。

## 二、创建新的网卡

现在，让我们前往Hyper-V虚拟机，首先，创建一个新的虚拟交换机，如下图：

![在Hyper-V中创建一个新的虚拟交换机][new-adapter]

会弹出窗口让你命名，笔者这里就命名为`Meta-Tunnel`。

## 三、配置虚拟机网卡

打开你对应的Hyper-V虚拟机，进行两个步骤：

1. 删去默认的`Default Switch`
2. 将网卡`Meta-Tunnel`添加进去

操作如下：

![将网卡添加到虚拟机][set-adapter]

## 四、链接虚拟网卡与TUN隧道

以管理员身份打开一个PowerSHell窗口，输入并执行下面的命令：

```ps wrap
# 记得更改为你的网卡的名字！
$vSwitchName = "Meta-Tunnel"
$vSwitch = Get-NetAdapter | Where-Object {$_.Name -like "*$vSwitchName*"}

# 设置物理机这边的 IP 为 192.168.137.1
New-NetIPAddress -IPAddress 192.168.137.1 -PrefixLength 24 -InterfaceIndex $vSwitch.InterfaceIndex
```

如果你不喜欢`192.168.137.1`，也可以更改。接下来，依然在这个窗口里面，执行命令：

```ps wrap
New-NetNat -Name "MetaNat" -InternalIPInterfaceAddressPrefix 192.168.137.0/24
```

这条命令告诉 Windows，凡是来自`192.168.137.0/24`网段的数据，都帮我做 NAT 转发出去。它会自动寻找当前系统的主出口（也就是TUN网卡啦）。

不过，`New-NetNat`并不带有DHCP服务，所以我们还得给虚拟机配置静态IP！

## 五、配置虚拟机静态IP

采用下面的设定！IP地址填`192.168.137.2`到`192.168.137.254`都没问题。

```yaml
IP: 192.168.137.10
掩码: 255.255.255.0
网关: 192.168.137.1
DNS: 192.168.137.1
```

# 方法三：连接共享（ICS）

:::warning
不建议使用这个方法！因为Windows的ICS服务向来很不稳定！重启物理机后必定失效，需要重新配置！
:::

先按照方法二完成步骤一二三，然后做下面的步骤。

1. 按 Win + R，输入`ncpa.cpl`并回车，打开网络连接面板。
2. 找到虚拟网卡`Meta`。
3. 右键点击网卡 -> `属性`。
4. 切换到`共享`选项卡。
5. 勾选 “允许其他网络用户通过此计算机的 Internet 连接来连接”。
6. 在“家庭网络连接”下拉菜单中，选择`Meta-Tunnel`。点击确定。

![通过ICS进行网络共享][configure-ics]

__再次重申：不建议使用这个方法！强烈建议使用[配置网卡](#method-two-set-adapter)的方法！__

:::TIP
好吧，其实我更推荐[让Hyper-V虚拟机通过IPv6上网][hyperv-ipv6]。
:::


<!-- 引用 -->

[hyperv-ipv6]: /posts/hyperv-ipv6/ "Hyper-V虚拟机与IPv6"
[new-adapter]: ./new-adapter.png "新建交换机"
[set-adapter]: ./set-adapter.png "添加交换机"
[configure-ics]: ./configure-ics.png "配置网络共享"