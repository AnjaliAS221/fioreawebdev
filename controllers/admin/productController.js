const mongoose = require('mongoose');
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");



const getProductAddPage = async ( req,res)=>{
    try {
        const category = await Category.find({isListed:true});
        res.render("product-add",{
            cat:category, 
            product: null
        });
    } catch (error) {
        console.error("Error in getProductAddPage:", error);
        res.redirect("/admin/pageerror");
    }
}


const addProducts = async (req, res) => {
    try {
        const { productName, description, regularPrice, salePrice, category} = req.body;

        const variants = JSON.parse(req.body.variantsData);

        if (!variants.length || variants.some(v => !v.color || !v.sizes.length)) {
            req.flash('error_msg', 'Please add valid product variants with colors and sizes.');
            return res.redirect("/admin/products");
        }

        
        const productExists = await Product.findOne({ productName });
        if (productExists) {
            req.flash('error_msg', 'Product already exists, please try with another name.');
            return res.redirect("/admin/products");
        }

        
        if (!mongoose.Types.ObjectId.isValid(category)) {
            req.flash('error_msg', 'Invalid category format');
            return res.redirect("/admin/products");
        }

        const categoryId = await Category.findById(category);
        if (!categoryId) {
            req.flash('error_msg', 'Selected category not found');
            return res.redirect("/admin/products");
        }

        
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const originalImagePath = req.files[i].path;

                const resizedImagePath = path.join('public', 'uploads', 'product-images', req.files[i].filename);
                await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizedImagePath);
                images.push(req.files[i].filename);
            }
        }

        
        const newProduct = new Product({
            productName,
            description,
            category: categoryId._id,
            regularPrice,
            salePrice,
            productOffer: req.body.productOffer || 0,
            variants,
            productImage: images,
            isBlocked: false,
            status: 'Available',
        });

        await newProduct.save();
        req.flash('success_msg', 'Product added successfully!');
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error saving product:", error);
        req.flash('error_msg', 'An error occurred while saving the product.');
        res.redirect("/admin/pageerror");
    }
};



const getAllProducts = async(req,res)=>{
    try {
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;

        const productData = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
                

            ],
        }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
              

            ],
        }).countDocuments();

        const category = await Category.find({isListed:true});
        

        if(category){
            res.render("products",{
                data:productData,
                currentPage:page,
                totalPages:Math.ceil(count/limit),
                cat:category,
                success_msg: req.flash('success_msg'),
                error_msg: req.flash('error_msg'),
                
            })
        }else{
            res.render("page-404");
        }

    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const addProductOffer = async (req, res) => {
    try {
        const { productId, percentage } = req.body;

        if (percentage > 100 ) {
            return res.json({ status: false, message: "Offer percentage cannot exceed 100%" });
        }

        if (percentage < 1 ) {
            return res.json({ status: false, message: "Offer percentage must be at least 1%" });
        }

        const findProduct = await Product.findOne({ _id: productId });
        const findCategory = await Category.findOne({ _id: findProduct.category });

        if (findCategory.categoryOffer > percentage) {
            return res.json({ status: false, message: "This product category already has a category offer" });
        }

        
        findProduct.salePrice = findProduct.regularPrice * (1 - percentage / 100);
        findProduct.productOffer = parseInt(percentage);
        await findProduct.save();

      
        findCategory.categoryOffer = 0;
        await findCategory.save();

        return res.json({ status: true });
    } catch (error) {
        console.error("Error in addProductOffer:", error);
        return res.status(500).json({ status: false, message: "Internal server error" });
    }
};


const removeProductOffer = async(req,res)=>{
    try {
        const {productId} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.salePrice+Math.floor(findProduct.regularPrice*(percentage/100));
        findProduct.productOffer = 0;
        await findProduct.save();
        res.json({status:true});

    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const blockProduct = async(req,res)=>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:true}});
        req.flash('success_msg', 'Product blocked successfully.');
        res.redirect("/admin/products");
    } catch (error) {
        req.flash('error_msg', 'Failed to block the product.');
        res.redirect("/admin/pageerror");
    }
}
const unblockProduct = async(req,res)=>{
    try {
        let id = req.query.id;
        await Product.updateOne({_id:id},{$set:{isBlocked:false}});
        req.flash('success_msg', 'Product unblocked successfully.');
        res.redirect("/admin/products");
    } catch (error) {
        req.flash('error_msg', 'Failed to unblock the product.');
        res.redirect("/admin/pageerror");
    }
}

const getEditProduct = async(req,res)=>{
    try {
        
        const id = req.query.id;
        const product = await Product.findOne({_id:id});
        const category = await Category.find({});
        res.render("edit-product",{
            product:product,
            cat:category,
           
        })
    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;

        // Check if a product with the same name exists (excluding the current product)
        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });

        if (existingProduct) {
            req.flash('error_msg', 'Product with this name already exists. Please try another name.');
            return res.redirect('/admin/editProduct?id=' + id);
        }

        // Process new images if uploaded
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
        }

        // Validate and find the category
        const category = await Category.findById(data.category );
        if (!category) {
            req.flash('error_msg', 'Invalid category. Please select a valid category.');
            return res.redirect('/admin/editProduct?id=' + id);
        }

        // Process variants
        const colors = Array.isArray(data.colors)
            ? data.colors.filter(color => color && color.trim() !== '')
            : (data.colors ? [data.colors] : []);

        const sizes = Array.isArray(data.sizes)
            ? data.sizes.filter(size => size && size.trim() !== '')
            : (data.sizes ? [data.sizes] : []);

        const stocks = Array.isArray(data.stocks)
            ? data.stocks.filter(stock => !isNaN(stock) && stock > 0)
            : (data.stocks ? [Number(data.stocks)] : []);

        if (colors.length !== sizes.length || colors.length !== stocks.length) {
            req.flash('error_msg', 'Mismatch in variants (colors, sizes, stocks). Please check your input.');
            return res.redirect('/admin/editProduct?id=' + id);
        }

        const variants = colors.map((color, index) => ({
            color,
            size: sizes[index],
            stock: stocks[index] || 0
        }));

        // Prepare fields to update
        const updateFields = {
            productName: data.productName,
            description: data.description,
            category: category._id,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            productOffer: data.productOffer || 0,
            variants: variants,
            status: data.status || "Available",
            isBlocked: data.isBlocked === "true"
        };

        // If new images are uploaded, append them
        if (images.length > 0) {
            updateFields.$push = {
                productImage: { $each: images }
            };
        }

        // Update the product
        await Product.findByIdAndUpdate(id, updateFields, { new: true });
        req.flash('success_msg', 'Product updated successfully.');
        res.redirect("/admin/products");

    } catch (error) {
        console.error("Error updating product:", error);
        req.flash('error_msg', 'An error occurred while updating the product.');
        res.redirect("/admin/pageerror");
    }
};


const deleteSingleImage = async (req,res)=>{
    try {
        const {imageNameToServer,productIdToServer} = req.body;
        const product = await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
        const imagePath = path.join("public","uploads","re-image",imageNameToServer);

        if(fs.existsSync(imagePath)){
            await fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully`);
        }else{
            console.log(`Image ${imageNameToServer} not found`);
        }

        res.send({status:true});

    } catch (error) {
        res.redirect("/admin/pageerror");
    }
}

module.exports ={
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage
}